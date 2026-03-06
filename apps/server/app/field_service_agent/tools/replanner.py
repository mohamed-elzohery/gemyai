"""Replanner sub-agent tool.

When a step fails or the technician reports unexpected results, this tool
analyses the situation and produces an adjusted plan from the point of
failure.
"""

import json
import logging
import os

from google import genai
from google.adk.tools import ToolContext

from ..schemas import REPLAN_RESULT_SCHEMA

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini client (lazy)
# ---------------------------------------------------------------------------
_genai_client: genai.Client | None = None
SUB_AGENT_MODEL = os.getenv("SUB_AGENT_MODEL", "gemini-3-flash-preview")


def _get_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client()
    return _genai_client


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
_REPLANNER_SYSTEM = """\
You are a field-service repair replanner. A step in the current repair plan
has failed or produced unexpected results. Your job is to:

1. Analyse what went wrong and why.
2. Decide whether the original diagnosis might be wrong
   (requires_new_diagnosis = true if so).
3. Produce an updated list of remaining steps that account for the failure.
4. Indicate which step to resume from.

RULES:
- Do NOT repeat steps that already succeeded.
- If the failure is minor (e.g. screw was stuck), just adjust the current step.
- If the failure calls the diagnosis into question, set
  requires_new_diagnosis = true and explain why.
- Keep the plan practical and safe.
"""


async def replan_fix(
    failure_description: str,
    tool_context: ToolContext,
) -> dict:
    """Re-plan the repair after a step failure or unexpected observation.

    Call this tool when a step does not go as expected and the
    current plan needs adjustment.

    Args:
        failure_description: What went wrong — include the step number,
            what was attempted, and what the technician observed.
        tool_context: Injected by ADK — provides session state.
    """
    state = tool_context.session.state
    session_id = state.get("ws_session_id", tool_context.session.id)
    logger.info("[Replanner] Called: session=%s", session_id)

    fix_plan_json = state.get("fix_plan", "")
    step_results_json = state.get("step_results", "{}")
    diagnosis_json = state.get("diagnosis_report", "")
    current_step = state.get("current_step", 1)

    prompt = (
        f"Original diagnosis:\n{diagnosis_json}\n\n"
        f"Current fix plan:\n{fix_plan_json}\n\n"
        f"Step results so far:\n{step_results_json}\n\n"
        f"Current step number: {current_step}\n\n"
        f"Failure description:\n{failure_description}\n\n"
        "Produce a revised plan following the schema."
    )

    try:
        client = _get_client()
        response = await client.aio.models.generate_content(
            model=SUB_AGENT_MODEL,
            contents=[genai.types.Part.from_text(text=prompt)],
            config=genai.types.GenerateContentConfig(
                system_instruction=_REPLANNER_SYSTEM,
                thinking_config=genai.types.ThinkingConfig(thinking_budget=2048),
                response_mime_type="application/json",
                response_schema=REPLAN_RESULT_SCHEMA,
                tools=[genai.types.Tool(google_search=genai.types.GoogleSearch())],
            ),
        )
        raw = response.text.strip()
        logger.info("[Replanner] Raw response: %s", raw[:500])
        result = json.loads(raw)
    except Exception as e:
        logger.error("[Replanner] Gemini call failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Replanning failed: {e}",
        }

    # Update the plan in session state
    if result.get("requires_new_diagnosis"):
        state["phase"] = "replanning_needs_diagnosis"
        logger.info("[Replanner] Phase → replanning_needs_diagnosis")
    else:
        # Merge updated steps back into the fix plan
        try:
            plan = json.loads(fix_plan_json) if fix_plan_json else {}
        except json.JSONDecodeError:
            plan = {}

        plan["steps"] = result.get("updated_steps", plan.get("steps", []))
        state["fix_plan"] = json.dumps(plan, ensure_ascii=False)
        state["current_step"] = result.get("resume_from_step", current_step)
        state["phase"] = "execution"
        logger.info(
            "[Replanner] Phase → execution (resume from step %s)",
            result.get("resume_from_step"),
        )

    return result
