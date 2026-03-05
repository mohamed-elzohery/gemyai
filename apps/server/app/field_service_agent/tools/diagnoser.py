"""Iterative diagnoser sub-agent tools.

Provides two function tools that drive a step-by-step diagnostic
conversation with the technician:

- start_diagnosis: kick off the diagnosis from the initial problem summary.
- submit_diagnosis_answer: feed the technician's answer back and get the
  next question or a final diagnosis.

Each call sends the full conversation history + the latest camera frame
to gemini-3-flash-preview so it can ask targeted, context-aware questions.
"""

import json
import logging
import os

from google import genai
from google.adk.tools import ToolContext

from ..schemas import DIAGNOSIS_STEP_SCHEMA
from ..visual_grounding import get_latest_image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini client (lazy, shared across tools in this process)
# ---------------------------------------------------------------------------
_genai_client: genai.Client | None = None
SUB_AGENT_MODEL = os.getenv("SUB_AGENT_MODEL", "gemini-3-flash-preview")


def _get_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client()
    return _genai_client


# ---------------------------------------------------------------------------
# System prompt for the iterative diagnoser
# ---------------------------------------------------------------------------
_DIAGNOSER_SYSTEM = """\
You are an expert field-service diagnostic engineer conducting a live
diagnostic session with a technician.

YOUR TASK:
Analyse the conversation so far (problem description + all previous
answers) and decide whether you have enough information to complete the
diagnosis or need one more piece of information.

RULES:
- Ask ONE focused question at a time — never multiple.
- Each question should build on the answers already given.
- If images are provided, describe what you observe and factor that into
  your reasoning.
- When you have enough information to identify at least one plausible
  root cause, set type to "complete" and fill summary, potential_issues,
  and recommended_action.
- While still gathering information, set type to "question", provide the
  question and a brief reason, and put a short progress note in summary.
- Rank potential_issues by confidence (high → low).
- Keep explanations concise but technically precise.
- Do NOT ask more than 6 questions total — if you reach that limit,
  produce the best diagnosis you can with available information.
"""


def _build_history_text(history: list[dict]) -> str:
    """Render the diagnosis conversation history as a readable block."""
    lines: list[str] = []
    for entry in history:
        role = "Technician" if entry["role"] == "user" else "Diagnostic Agent"
        lines.append(f"{role}: {entry['content']}")
    return "\n".join(lines)


async def _call_diagnoser(
    parts: list[genai.types.Part],
) -> dict:
    """Send parts to the diagnoser model and return parsed JSON."""
    client = _get_client()
    response = await client.aio.models.generate_content(
        model=SUB_AGENT_MODEL,
        contents=parts,
        config=genai.types.GenerateContentConfig(
            system_instruction=_DIAGNOSER_SYSTEM,
            thinking_config=genai.types.ThinkingConfig(thinking_budget=4096),
            response_mime_type="application/json",
            response_schema=DIAGNOSIS_STEP_SCHEMA,
        ),
    )
    raw = response.text.strip()
    logger.info("[Diagnoser] Raw response: %s", raw[:500])
    return json.loads(raw)


def _attach_camera_frame(parts: list[genai.types.Part], session_id: str) -> None:
    """Append the latest camera frame to *parts* if available."""
    image_bytes = get_latest_image(session_id)
    if image_bytes:
        parts.append(
            genai.types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
        )
        logger.info("[Diagnoser] Attached latest camera frame")


def _handle_result(result: dict, state: dict) -> dict:
    """Persist diagnosis state and return the tool result."""
    if result.get("type") == "complete":
        state["diagnosis_report"] = json.dumps(result, ensure_ascii=False)
        state["diagnosis_status"] = "complete"
        state["phase"] = "diagnosis_complete"
        logger.info("[Diagnoser] Phase → diagnosis_complete")
    else:
        # Another question
        question = result.get("question", "")
        state["current_diagnosis_question"] = question
        state["diagnosis_status"] = "questioning"
        state["phase"] = "diagnosis"
        # Append the agent's question to history
        history = json.loads(state.get("diagnosis_history", "[]"))
        history.append({"role": "agent", "content": question, "has_image": False})
        state["diagnosis_history"] = json.dumps(history, ensure_ascii=False)
        logger.info("[Diagnoser] Phase → diagnosis (question: %s)", question[:80])
    return result


# ===================================================================
# Public tool functions
# ===================================================================


async def start_diagnosis(
    problem_summary: str,
    tool_context: ToolContext,
) -> dict:
    """Begin the diagnostic process for an equipment problem.

    Call this tool as soon as the technician describes an issue.
    It will return either the first clarifying question or, if the
    problem is immediately diagnosable, a complete diagnosis.

    Args:
        problem_summary: A concise summary of the problem as described
            by the technician. Include symptoms, equipment type/model,
            error codes, and any other relevant details mentioned.
        tool_context: Injected by ADK — provides session state.
    """
    session_id = tool_context.session.id
    state = tool_context.session.state
    logger.info(
        "[Diagnoser] start_diagnosis called: summary=%r, session=%s",
        problem_summary,
        session_id,
    )

    # Initialise diagnosis conversation history
    history: list[dict] = [
        {"role": "user", "content": problem_summary, "has_image": True}
    ]
    state["diagnosis_history"] = json.dumps(history, ensure_ascii=False)
    state["diagnosis_status"] = "questioning"

    # Build content parts
    parts: list[genai.types.Part] = []
    prompt = (
        f"The technician has reported the following problem:\n\n"
        f"{problem_summary}\n\n"
        "This is the start of the diagnostic session. Decide whether you "
        "need more information (ask ONE question) or can already produce "
        "a complete diagnosis."
    )
    parts.append(genai.types.Part.from_text(text=prompt))
    _attach_camera_frame(parts, session_id)

    try:
        result = await _call_diagnoser(parts)
    except Exception as e:
        logger.error("[Diagnoser] Gemini call failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Diagnosis failed due to an internal error: {e}",
        }

    return _handle_result(result, state)


async def submit_diagnosis_answer(
    answer_text: str,
    tool_context: ToolContext,
) -> dict:
    """Submit the technician's answer and continue the diagnosis.

    Call this tool after the technician answers a diagnostic question.
    The full conversation history and the latest camera image are sent
    to the diagnostic engine, which will either ask the next question
    or produce a complete diagnosis.

    Args:
        answer_text: The technician's answer to the latest diagnostic
            question, including any observations they described.
        tool_context: Injected by ADK — provides session state.
    """
    session_id = tool_context.session.id
    state = tool_context.session.state
    logger.info(
        "[Diagnoser] submit_diagnosis_answer called: answer=%r, session=%s",
        answer_text,
        session_id,
    )

    # Append user answer to history
    history = json.loads(state.get("diagnosis_history", "[]"))
    history.append({"role": "user", "content": answer_text, "has_image": True})
    state["diagnosis_history"] = json.dumps(history, ensure_ascii=False)

    # Build content parts with full conversation context
    parts: list[genai.types.Part] = []
    conversation_text = _build_history_text(history)
    question_count = sum(1 for h in history if h["role"] == "agent")

    prompt = (
        f"Diagnostic conversation so far:\n\n{conversation_text}\n\n"
        f"({question_count} question(s) asked so far out of a maximum of 6.)\n\n"
        "Based on ALL the information gathered, decide whether to ask ONE "
        "more targeted question or produce the final diagnosis."
    )
    parts.append(genai.types.Part.from_text(text=prompt))
    _attach_camera_frame(parts, session_id)

    try:
        result = await _call_diagnoser(parts)
    except Exception as e:
        logger.error("[Diagnoser] Gemini call failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Diagnosis failed due to an internal error: {e}",
        }

    return _handle_result(result, state)
