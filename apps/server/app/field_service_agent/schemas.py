"""Structured output schemas for the field service agent.

Contains the Gemini structured-output schema used by the
``generate_fix_report`` tool to extract a well-formed report from
a conversation summary and image metadata.
"""

from google import genai

# ---------------------------------------------------------------------------
# Report extraction schema
# ---------------------------------------------------------------------------

_execution_step_schema = genai.types.Schema(
    type="OBJECT",
    properties={
        "step_number": genai.types.Schema(type="INTEGER"),
        "description": genai.types.Schema(type="STRING"),
        "outcome": genai.types.Schema(type="STRING"),
    },
    required=["step_number", "description", "outcome"],
)

_selected_image_schema = genai.types.Schema(
    type="OBJECT",
    properties={
        "artifact_name": genai.types.Schema(type="STRING"),
        "caption": genai.types.Schema(type="STRING"),
        "category": genai.types.Schema(
            type="STRING", enum=["before", "during", "after"]
        ),
    },
    required=["artifact_name", "caption", "category"],
)

REPORT_DATA_SCHEMA = genai.types.Schema(
    type="OBJECT",
    properties={
        "equipment_info": genai.types.Schema(type="STRING"),
        "problem_summary": genai.types.Schema(type="STRING"),
        "final_diagnosis": genai.types.Schema(type="STRING"),
        "repair_plan_summary": genai.types.Schema(type="STRING"),
        "execution_log": genai.types.Schema(
            type="ARRAY",
            items=_execution_step_schema,
        ),
        "follow_up_recommendations": genai.types.Schema(
            type="ARRAY",
            items=genai.types.Schema(type="STRING"),
        ),
        "selected_images": genai.types.Schema(
            type="ARRAY",
            items=_selected_image_schema,
        ),
    },
    required=[
        "equipment_info",
        "problem_summary",
        "final_diagnosis",
        "repair_plan_summary",
        "execution_log",
        "follow_up_recommendations",
        "selected_images",
    ],
)
