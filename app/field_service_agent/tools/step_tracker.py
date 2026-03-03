"""Step-tracker sub-agent tools.

Provides two function tools:
- get_current_step: retrieve the next step the technician should perform.
- report_step_result: record the outcome of the current step.
"""

import json
import logging

from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)


async def get_current_step(tool_context: ToolContext) -> dict:
    """Return the current step the technician should perform.

    Call this tool to retrieve the details of the next step in the
    repair plan so you can guide the technician through it.

    Args:
        tool_context: Injected by ADK — provides session state.
    """
    state = tool_context.session.state
    session_id = tool_context.session.id

    fix_plan_json = state.get("fix_plan", "")
    if not fix_plan_json:
        return {
            "status": "error",
            "description": "No fix plan found. Run create_fix_plan first.",
        }

    try:
        plan = json.loads(fix_plan_json)
    except json.JSONDecodeError:
        return {"status": "error", "description": "Fix plan is corrupted."}

    steps = plan.get("steps", [])
    current_step_num = state.get("current_step", 1)
    total_steps = len(steps)

    if current_step_num > total_steps:
        return {
            "status": "complete",
            "description": "All steps have been completed! The repair is done.",
            "total_steps": total_steps,
        }

    # Find the step (1-based index)
    step = None
    for s in steps:
        if s.get("step_number") == current_step_num:
            step = s
            break

    if step is None and steps:
        # Fallback: use list index
        idx = current_step_num - 1
        if 0 <= idx < len(steps):
            step = steps[idx]

    if step is None:
        return {"status": "error", "description": f"Step {current_step_num} not found."}

    # Include progress info
    step_results = json.loads(state.get("step_results", "{}"))
    completed_count = len(step_results)

    logger.info(
        "[StepTracker] get_current_step: step %d/%d, session=%s",
        current_step_num,
        total_steps,
        session_id,
    )

    return {
        "status": "in_progress",
        "current_step": step,
        "progress": {
            "current": current_step_num,
            "total": total_steps,
            "completed": completed_count,
        },
        "plan_title": plan.get("title", ""),
    }


async def report_step_result(
    step_status: str,
    user_observation: str,
    tool_context: ToolContext,
) -> dict:
    """Record the outcome of the current step.

    Call this tool after the technician completes (or fails) the
    current step. Based on the result, the system will either advance
    to the next step or flag the need for replanning.

    Args:
        step_status: Outcome — one of "success", "failed", "skipped", "partial".
        user_observation: What the technician observed or reported about this step.
        tool_context: Injected by ADK — provides session state.
    """
    state = tool_context.session.state
    session_id = tool_context.session.id

    current_step_num = state.get("current_step", 1)
    fix_plan_json = state.get("fix_plan", "")

    logger.info(
        "[StepTracker] report_step_result: step=%d, status=%s, session=%s",
        current_step_num,
        step_status,
        session_id,
    )

    # Record the result
    step_results = json.loads(state.get("step_results", "{}"))
    step_results[str(current_step_num)] = {
        "status": step_status,
        "observation": user_observation,
    }
    state["step_results"] = json.dumps(step_results, ensure_ascii=False)

    # Determine next action
    if step_status in ("success", "skipped"):
        # Advance to next step
        try:
            plan = json.loads(fix_plan_json) if fix_plan_json else {}
        except json.JSONDecodeError:
            plan = {}

        total_steps = len(plan.get("steps", []))
        next_step = current_step_num + 1
        state["current_step"] = next_step

        if next_step > total_steps:
            state["phase"] = "completed"
            logger.info("[StepTracker] Phase → completed")
            return {
                "status": "all_complete",
                "description": (
                    f"All {total_steps} steps completed successfully! "
                    "The repair is finished."
                ),
                "step_results_summary": step_results,
            }

        logger.info("[StepTracker] Advanced to step %d/%d", next_step, total_steps)
        return {
            "status": "next_step",
            "description": f"Step {current_step_num} recorded as {step_status}. Moving to step {next_step}.",
            "next_step_number": next_step,
            "total_steps": total_steps,
        }

    elif step_status == "failed":
        state["phase"] = "replanning"
        logger.info(
            "[StepTracker] Phase → replanning (step %d failed)", current_step_num
        )
        return {
            "status": "needs_replan",
            "description": (
                f"Step {current_step_num} failed: {user_observation}. "
                "Use replan_fix to create an adjusted plan."
            ),
            "failed_step": current_step_num,
        }

    else:  # partial
        logger.info(
            "[StepTracker] Step %d partial — staying on same step", current_step_num
        )
        return {
            "status": "partial",
            "description": (
                f"Step {current_step_num} partially completed. "
                "Continue working on this step or report again when done."
            ),
            "current_step": current_step_num,
        }
