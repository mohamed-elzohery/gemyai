"""Workflow signal tools for multi-agent coordination.

These lightweight function tools are used by sub-agents to signal
completion, exit, or escalation. They write structured output to
session.state and set tool_context.actions to transfer control
back to the root coordinator agent.
"""

import json
import logging
import time

from google.adk.tools import ToolContext

from ..visual_grounding import get_image_buffer

logger = logging.getLogger(__name__)


# ===================================================================
# Intake → Root (symptoms collected)
# ===================================================================


async def complete_intake(
    symptoms_summary: str,
    equipment_type: str,
    equipment_model: str,
    tool_context: ToolContext,
) -> dict:
    """Signal that symptom collection is complete.

    Call this tool when you have gathered enough information about the
    problem (description, equipment type/model, symptoms, what the user
    showed on camera). This will hand off to the diagnosis phase.

    Args:
        symptoms_summary: A clear, detailed summary of the problem
            including all symptoms the technician described and anything
            observed on camera.
        equipment_type: The type of equipment (e.g. "printer", "HVAC unit").
        equipment_model: The model/brand if known (e.g. "HP LaserJet 1022").
            Use "unknown" if not provided.
        tool_context: Injected by ADK — provides session state.
    """
    session_id = tool_context.state.get("ws_session_id", tool_context.session.id)
    logger.info(
        "[Workflow] complete_intake: session=%s, equipment=%s %s",
        session_id,
        equipment_type,
        equipment_model,
    )

    # Count available camera frames (images stay in the visual_grounding
    # buffer — they must NOT be serialised into session state because the
    # state is injected into agent instructions and would blow up the
    # Gemini API payload, causing a 1007 "invalid argument" disconnect).
    image_frames = get_image_buffer(session_id, max_count=5)
    logger.info(
        "[Workflow] %d camera frames available in image buffer",
        len(image_frames),
    )

    symptoms_report = {
        "summary": symptoms_summary,
        "equipment_type": equipment_type,
        "equipment_model": equipment_model,
        "image_count": len(image_frames),
        "timestamp": time.time(),
    }

    state = tool_context.state
    state["symptoms_report"] = json.dumps(symptoms_report, ensure_ascii=False)
    state["phase"] = "diagnosis"

    # Escalate to root — root will transfer to diagnoser
    tool_context.actions.escalate = True
    logger.info("[Workflow] Phase → diagnosis (escalating to root)")

    return {
        "status": "success",
        "description": "Symptoms collected. Handing off to diagnosis.",
    }


# ===================================================================
# Diagnoser → Root (diagnosis complete)
# ===================================================================


async def complete_diagnosis(
    diagnosis_summary: str,
    potential_causes: str,
    recommended_action: str,
    tool_context: ToolContext,
) -> dict:
    """Signal that diagnosis is complete.

    Call this tool when you have identified the likely cause(s) of the
    problem and are ready to hand off to the repair planning phase.

    Args:
        diagnosis_summary: A clear summary of what was found during
            diagnosis, including observations and reasoning.
        potential_causes: A detailed description of the identified
            potential causes, ranked by likelihood. Include confidence
            levels (high/medium/low) for each cause.
        recommended_action: The single best next action to take
            (e.g. "Replace the power supply unit").
        tool_context: Injected by ADK — provides session state.
    """
    session_id = tool_context.state.get("ws_session_id", tool_context.session.id)
    logger.info("[Workflow] complete_diagnosis: session=%s", session_id)

    diagnose_report = {
        "summary": diagnosis_summary,
        "potential_causes": potential_causes,
        "recommended_action": recommended_action,
        "timestamp": time.time(),
    }

    state = tool_context.state
    state["diagnose_report"] = json.dumps(diagnose_report, ensure_ascii=False)
    state["phase"] = "planning"

    tool_context.actions.escalate = True
    logger.info("[Workflow] Phase → planning (escalating to root)")

    return {
        "status": "success",
        "description": "Diagnosis complete. Handing off to repair planning.",
    }


# ===================================================================
# Planner → Root (repair complete or failed)
# ===================================================================


async def complete_repair(
    fix_summary: str,
    outcome: str,
    details: str,
    tool_context: ToolContext,
) -> dict:
    """Signal that the repair process is complete or has failed.

    Call this tool when all repair steps are done, or when the repair
    cannot continue and needs to be escalated.

    Args:
        fix_summary: A detailed summary of what was done during the
            repair, including steps completed, observations, and results.
        outcome: One of: "success" (repair completed successfully),
            "failed_needs_more_data" (need more symptoms or information),
            "failed_wrong_diagnosis" (the diagnosis appears incorrect).
        details: Additional context about the outcome — what worked,
            what didn't, and why. This helps if the flow needs to restart.
        tool_context: Injected by ADK — provides session state.
    """
    session_id = tool_context.state.get("ws_session_id", tool_context.session.id)
    logger.info(
        "[Workflow] complete_repair: session=%s, outcome=%s", session_id, outcome
    )

    fix_report = {
        "summary": fix_summary,
        "outcome": outcome,
        "details": details,
        "timestamp": time.time(),
    }

    state = tool_context.state
    state["fix_report"] = json.dumps(fix_report, ensure_ascii=False)

    if outcome == "success":
        state["phase"] = "completed"
    else:
        state["phase"] = "needs_reroute"

    tool_context.actions.escalate = True
    logger.info("[Workflow] Phase → %s (escalating to root)", state["phase"])

    return {
        "status": "success",
        "description": f"Repair {outcome}. Handing off to coordinator.",
    }


# ===================================================================
# Any sub-agent → Root (user wants to exit)
# ===================================================================


async def exit_conversation(
    reason: str,
    tool_context: ToolContext,
) -> dict:
    """Exit the current workflow when the user wants to cancel or stop.

    Call this tool when the user explicitly asks to cancel, stop, or
    exit the current repair workflow.

    Args:
        reason: Why the user wants to exit (e.g. "user requested to stop",
            "user wants to try later").
        tool_context: Injected by ADK — provides session state.
    """
    logger.info("[Workflow] exit_conversation: reason=%r", reason)

    state = tool_context.state
    state["phase"] = "exited"
    state["exit_reason"] = reason

    tool_context.actions.escalate = True
    logger.info("[Workflow] Phase → exited (escalating to root)")

    return {
        "status": "success",
        "description": "Conversation exit requested.",
    }


# ===================================================================
# Any sub-agent → Root (needs help / can't proceed)
# ===================================================================


async def escalate_to_root(
    reason: str,
    tool_context: ToolContext,
) -> dict:
    """Escalate to the root coordinator when unable to proceed.

    Call this tool when you cannot complete your task and need the
    coordinator to decide what to do next.

    Args:
        reason: A clear explanation of why you cannot proceed and what
            was attempted. Include any partial findings.
        tool_context: Injected by ADK — provides session state.
    """
    logger.info("[Workflow] escalate_to_root: reason=%r", reason)

    state = tool_context.state
    state["escalation_reason"] = reason
    state["phase"] = "escalated"

    tool_context.actions.escalate = True
    logger.info("[Workflow] Phase → escalated (escalating to root)")

    return {
        "status": "success",
        "description": "Escalated to coordinator.",
    }
