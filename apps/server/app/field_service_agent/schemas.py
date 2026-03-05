"""Structured output schemas for Gemini sub-agent calls.

These `genai.types.Schema` definitions are passed as `response_schema` to
`client.aio.models.generate_content` so each sub-agent tool receives
well-typed JSON it can parse deterministically.
"""

from google import genai

# ---------------------------------------------------------------------------
# Diagnoser schemas
# ---------------------------------------------------------------------------

DIAGNOSIS_QUESTION_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="A clarifying question the agent needs answered before diagnosing.",
    properties={
        "question": genai.types.Schema(
            type="STRING",
            description="The question to ask the technician.",
        ),
        "reason": genai.types.Schema(
            type="STRING",
            description="Why this information is needed for diagnosis.",
        ),
    },
    required=["question", "reason"],
)

POTENTIAL_ISSUE_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="A single potential root cause identified during diagnosis.",
    properties={
        "issue": genai.types.Schema(
            type="STRING",
            description="Short name of the potential issue.",
        ),
        "explanation": genai.types.Schema(
            type="STRING",
            description="Detailed explanation of why this might be the cause.",
        ),
        "confidence": genai.types.Schema(
            type="STRING",
            description="Confidence level: high, medium, or low.",
            enum=["high", "medium", "low"],
        ),
    },
    required=["issue", "explanation", "confidence"],
)

DIAGNOSIS_RESULT_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="Complete diagnosis output.",
    properties={
        "status": genai.types.Schema(
            type="STRING",
            description="Whether diagnosis is complete or more info is needed.",
            enum=["complete", "need_info"],
        ),
        "questions": genai.types.Schema(
            type="ARRAY",
            description="Clarifying questions (only when status=need_info).",
            items=DIAGNOSIS_QUESTION_SCHEMA,
        ),
        "summary": genai.types.Schema(
            type="STRING",
            description="Human-readable diagnosis summary.",
        ),
        "potential_issues": genai.types.Schema(
            type="ARRAY",
            description="Ranked list of potential root causes.",
            items=POTENTIAL_ISSUE_SCHEMA,
        ),
        "recommended_action": genai.types.Schema(
            type="STRING",
            description="The single best next action to take.",
        ),
    },
    required=["status", "summary"],
)

# ---------------------------------------------------------------------------
# Iterative diagnosis step schema (used by start_diagnosis / submit_diagnosis_answer)
# ---------------------------------------------------------------------------

DIAGNOSIS_STEP_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="Result of a single diagnostic step — either a clarifying question or a complete diagnosis.",
    properties={
        "type": genai.types.Schema(
            type="STRING",
            description="Whether this step asks a question or completes the diagnosis.",
            enum=["question", "complete"],
        ),
        "question": genai.types.Schema(
            type="STRING",
            description="The clarifying question to ask the technician (only when type=question).",
        ),
        "reason": genai.types.Schema(
            type="STRING",
            description="Why this information is needed for diagnosis (only when type=question).",
        ),
        "summary": genai.types.Schema(
            type="STRING",
            description="Human-readable diagnosis summary.",
        ),
        "potential_issues": genai.types.Schema(
            type="ARRAY",
            description="Ranked list of potential root causes (only when type=complete).",
            items=POTENTIAL_ISSUE_SCHEMA,
        ),
        "recommended_action": genai.types.Schema(
            type="STRING",
            description="The single best next action to take (only when type=complete).",
        ),
    },
    required=["type", "summary"],
)

# ---------------------------------------------------------------------------
# Planner schemas
# ---------------------------------------------------------------------------

PLAN_STEP_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="A single step in the repair plan.",
    properties={
        "step_number": genai.types.Schema(
            type="INTEGER",
            description="1-based step index.",
        ),
        "title": genai.types.Schema(
            type="STRING",
            description="Short title for the step.",
        ),
        "instruction": genai.types.Schema(
            type="STRING",
            description="Detailed instruction for the technician.",
        ),
        "expected_outcome": genai.types.Schema(
            type="STRING",
            description="What the technician should observe when this step succeeds.",
        ),
        "warning": genai.types.Schema(
            type="STRING",
            description="Safety warning or caution for this step, if any.",
        ),
        "requires_visual_check": genai.types.Schema(
            type="BOOLEAN",
            description="Whether the technician should show the camera for verification.",
        ),
    },
    required=["step_number", "title", "instruction", "expected_outcome"],
)

FIX_PLAN_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="Complete step-by-step repair plan.",
    properties={
        "title": genai.types.Schema(
            type="STRING",
            description="Short title summarizing the fix.",
        ),
        "estimated_time_minutes": genai.types.Schema(
            type="INTEGER",
            description="Estimated total time in minutes.",
        ),
        "tools_needed": genai.types.Schema(
            type="ARRAY",
            description="List of tools or parts the technician will need.",
            items=genai.types.Schema(type="STRING"),
        ),
        "safety_notes": genai.types.Schema(
            type="ARRAY",
            description="Safety precautions to observe.",
            items=genai.types.Schema(type="STRING"),
        ),
        "steps": genai.types.Schema(
            type="ARRAY",
            description="Ordered list of repair steps.",
            items=PLAN_STEP_SCHEMA,
        ),
    },
    required=["title", "steps"],
)

# ---------------------------------------------------------------------------
# Replanner schemas
# ---------------------------------------------------------------------------

REPLAN_RESULT_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="Result of replanning after a step failure or deviation.",
    properties={
        "analysis": genai.types.Schema(
            type="STRING",
            description="Analysis of what went wrong and why.",
        ),
        "resume_from_step": genai.types.Schema(
            type="INTEGER",
            description="The step number to resume from (may be a new/adjusted step).",
        ),
        "updated_steps": genai.types.Schema(
            type="ARRAY",
            description="The revised list of remaining steps.",
            items=PLAN_STEP_SCHEMA,
        ),
        "requires_new_diagnosis": genai.types.Schema(
            type="BOOLEAN",
            description="Whether the failure suggests the original diagnosis was wrong.",
        ),
    },
    required=["analysis", "resume_from_step", "updated_steps"],
)

# ---------------------------------------------------------------------------
# Step tracker schemas
# ---------------------------------------------------------------------------

STEP_RESULT_SCHEMA = genai.types.Schema(
    type="OBJECT",
    description="Tracked result for a completed step.",
    properties={
        "step_number": genai.types.Schema(
            type="INTEGER",
            description="Which step this result is for.",
        ),
        "status": genai.types.Schema(
            type="STRING",
            description="Outcome of the step.",
            enum=["success", "failed", "skipped", "partial"],
        ),
        "observation": genai.types.Schema(
            type="STRING",
            description="What the technician observed.",
        ),
        "needs_replan": genai.types.Schema(
            type="BOOLEAN",
            description="Whether this result should trigger replanning.",
        ),
    },
    required=["step_number", "status", "observation"],
)
