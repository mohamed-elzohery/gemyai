"""Planner sub-agent tool.

Takes the diagnosis report from session state and generates a detailed,
step-by-step repair plan the coordinator can walk the technician through.
"""

import json
import logging
import os

from google import genai
from google.adk.tools import ToolContext

from ..schemas import FIX_PLAN_SCHEMA

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
_PLANNER_SYSTEM = """\
You are an expert field-service repair planner. Given a diagnosis of an
equipment problem, produce a detailed step-by-step fix plan.

RULES:
- Steps must be in logical execution order.
- Each step should be atomic — one clear action.
- Include expected_outcome so the technician knows what success looks like.
- Add warnings for steps involving electricity, heat, pressurised systems,
  or chemical hazards.
- Set requires_visual_check = true for steps that benefit from camera
  verification (e.g. "confirm connector is seated").
- List all tools and parts needed up front.
- Estimate total time realistically.
"""


async def create_fix_plan(
    additional_context: str,
    tool_context: ToolContext,
) -> dict:
    """Generate a step-by-step repair plan based on the current diagnosis.

    Call this tool after a successful diagnosis (status=complete) to
    create the repair plan the technician will follow.

    Args:
        additional_context: Any extra details the technician provided
            (e.g. available tools, parts on hand, time constraints).
            Pass empty string if none.
        tool_context: Injected by ADK — provides session state.
    """
    state = tool_context.session.state
    session_id = tool_context.session.id
    logger.info("[Planner] Called: session=%s", session_id)

    diagnosis_json = state.get("diagnosis_report", "")
    if not diagnosis_json:
        return {
            "status": "error",
            "description": ("No diagnosis report found. Run diagnose_problem first."),
        }

    prompt = (
        f"Diagnosis report:\n{diagnosis_json}\n\n"
        f"Additional context from technician:\n{additional_context or 'None'}\n\n"
        "Produce a detailed fix plan following the schema."
    )

    try:
        client = _get_client()
        response = await client.aio.models.generate_content(
            model=SUB_AGENT_MODEL,
            contents=[genai.types.Part.from_text(text=prompt)],
            config=genai.types.GenerateContentConfig(
                system_instruction=_PLANNER_SYSTEM,
                thinking_config=genai.types.ThinkingConfig(thinking_budget=4096),
                response_mime_type="application/json",
                response_schema=FIX_PLAN_SCHEMA,
            ),
        )
        raw = response.text.strip()
        logger.info("[Planner] Raw response: %s", raw[:500])
        result = json.loads(raw)
    except Exception as e:
        logger.error("[Planner] Gemini call failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Planning failed: {e}",
        }

    # Persist plan in session state
    state["fix_plan"] = json.dumps(result, ensure_ascii=False)
    state["current_step"] = 1
    state["step_results"] = "{}"
    state["phase"] = "execution"
    logger.info("[Planner] Phase → execution (%d steps)", len(result.get("steps", [])))

    return result
