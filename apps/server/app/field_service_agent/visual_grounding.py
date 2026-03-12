"""Visual grounding module — locates and marks objects in camera frames.

Uses gemini-3-flash-preview for bounding-box detection, then PIL to draw
red ellipses on the original image so the user can see what was found.

Image storage is handled by the shared ``frame_buffer`` module.  Annotated
images are also persisted as ADK artifacts with metadata in session state.
"""

import asyncio
import base64
import io
import json
import logging
import os
import time
from typing import Any

from google import genai
from google.adk.tools import ToolContext
from google.genai import types
from PIL import Image, ImageDraw

from .frame_buffer import (
    get_latest_frame,
    store_annotated_image,
    pop_annotated_image,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public re-exports so main.py doesn't need to import frame_buffer directly
# for annotated-image delivery.
# ---------------------------------------------------------------------------


def get_annotated_image(session_id: str) -> str | None:
    """Pop and return the latest annotated image (base64 JPEG), if any.

    Delegates to ``frame_buffer.pop_annotated_image``.
    """
    return pop_annotated_image(session_id)


# ---------------------------------------------------------------------------
# Gemini vision client (lazy init)
# ---------------------------------------------------------------------------
_genai_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client()
    return _genai_client


# The model used for visual grounding / bounding-box detection
GROUNDING_MODEL = os.getenv("GROUNDING_MODEL", "gemini-3-flash-preview")

# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------


def _draw_markers(
    image_bytes: bytes,
    detections: list[dict[str, Any]],
) -> bytes:
    """Draw red ellipses on *image_bytes* for each detection.

    Each detection dict must have:
        - ``box_2d``: [y_min, x_min, y_max, x_max] in 0–1000 space
        - ``label``: human-readable string
    Returns JPEG bytes of the annotated image.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size

    for det in detections:
        box = det.get("box_2d", det.get("box2d", []))
        if len(box) != 4:
            continue
        y_min, x_min, y_max, x_max = box

        # Scale from 0–1000 coordinate space to actual pixels
        px_x_min = int(x_min / 1000 * w)
        px_x_max = int(x_max / 1000 * w)
        px_y_min = int(y_min / 1000 * h)
        px_y_max = int(y_max / 1000 * h)

        # Normalize: ensure min <= max (model sometimes swaps them)
        if px_x_min > px_x_max:
            px_x_min, px_x_max = px_x_max, px_x_min
        if px_y_min > px_y_max:
            px_y_min, px_y_max = px_y_max, px_y_min

        # Draw a red ellipse circumscribing the bounding box
        draw.ellipse(
            [px_x_min, px_y_min, px_x_max, px_y_max],
            outline="red",
            width=5,
        )

        # Draw label above the box
        label = det.get("label", "")
        if label:
            text_x = px_x_min
            text_y = max(px_y_min - 18, 0)
            # Draw text background for readability
            try:
                bbox = draw.textbbox((text_x, text_y), label)
                draw.rectangle(
                    [bbox[0] - 2, bbox[1] - 2, bbox[2] + 2, bbox[3] + 2],
                    fill="red",
                )
                draw.text((text_x, text_y), label, fill="white")
            except Exception:
                draw.text((text_x, text_y), label, fill="red")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# The ADK FunctionTool
# ---------------------------------------------------------------------------


async def annotate_image(query: str, tool_context: ToolContext) -> dict[str, str]:
    """Locate and mark regions in the latest camera frame.

    Call this tool when the user asks you to point at, locate, or
    identify something visible in the camera feed.

    Args:
        query: What to find in the image (e.g. "the USB-C slot").
        tool_context: Injected by ADK — provides session info.
    """
    # Use the WebSocket session ID stored in state (the ADK runner may
    # assign a different internal session ID).
    session_id = tool_context.state.get("ws_session_id", tool_context.session.id)
    logger.info(
        "[Annotation] annotate_image called: query=%r, session=%s", query, session_id
    )

    # 1. Grab the latest camera frame from the shared buffer
    image_bytes = get_latest_frame(session_id)

    if not image_bytes:
        logger.warning(
            "[Annotation] No camera image available for session %s", session_id
        )
        return {
            "status": "error",
            "description": "No camera image is available. Ask the user to enable their camera.",
        }

    # 2. Ask Gemini vision model for bounding boxes
    prompt = (
        "You are a visual grounding assistant. "
        "Identify the following objects or regions in this image. "
        "Return ONE bounding box per distinct object instance. "
        "Each box_2d must be exactly 4 integers [y_min, x_min, y_max, x_max] "
        "in 0-1000 coordinate space.\n\n"
        f"Query: {query}"
    )

    # Use structured output to guarantee valid JSON
    detection_schema = genai.types.Schema(
        type="ARRAY",
        items=genai.types.Schema(
            type="OBJECT",
            properties={
                "label": genai.types.Schema(type="STRING"),
                "box_2d": genai.types.Schema(
                    type="ARRAY",
                    items=genai.types.Schema(type="INTEGER"),
                ),
            },
            required=["label", "box_2d"],
        ),
    )

    try:
        client = _get_client()
        logger.info(
            "[Annotation] Calling grounding model %s with %d bytes image...",
            GROUNDING_MODEL,
            len(image_bytes),
        )
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=GROUNDING_MODEL,
                contents=[
                    genai.types.Part.from_bytes(
                        data=image_bytes, mime_type="image/jpeg"
                    ),
                    genai.types.Part.from_text(text=prompt),
                ],
                config=genai.types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=detection_schema,
                ),
            ),
            timeout=30.0,
        )
        raw_text = response.text.strip() if response.text else ""
        logger.info("[Annotation] Grounding model raw response: %s", raw_text)

        if not raw_text:
            logger.warning("[Annotation] Grounding model returned empty response")
            return {
                "status": "no_detections",
                "description": (
                    "The vision model returned an empty response. "
                    "Try pointing the camera directly at the area."
                ),
            }

        detections = json.loads(raw_text)
        if not isinstance(detections, list):
            detections = [detections]

        # Filter out malformed boxes (must have exactly 4 values)
        detections = [
            d
            for d in detections
            if isinstance(d.get("box_2d"), list) and len(d["box_2d"]) == 4
        ]

    except asyncio.TimeoutError:
        logger.error("[Annotation] Grounding model call timed out after 30s")
        return {
            "status": "error",
            "description": (
                "Visual grounding timed out. The image analysis took too long. "
                "Try again or describe the location verbally."
            ),
        }
    except Exception as e:
        logger.error("[Annotation] Grounding model call failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Visual grounding failed: {e}",
        }

    if not detections:
        return {
            "status": "no_detections",
            "description": (
                "I looked at the camera feed but could not locate "
                "the requested object or region."
            ),
            "possible_reasons": (
                "The object may not be in the camera frame, the camera "
                "angle may be obscuring it, or the lighting may be "
                "insufficient for clear identification."
            ),
            "suggestions": (
                "Try pointing the camera directly at the area in question, "
                "move closer for a clearer view, ensure there is good "
                "lighting, or describe the location verbally so I can "
                "guide you to it."
            ),
        }

    # 3. Draw red markers on the image
    logger.info("[Annotation] Drawing markers for %d detection(s)", len(detections))
    try:
        annotated_bytes = _draw_markers(image_bytes, detections)
    except Exception as e:
        logger.error("[Annotation] Image annotation failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Failed to annotate image: {e}",
        }

    # 4. Store the annotated image for the delivery task to pick up
    annotated_b64 = base64.b64encode(annotated_bytes).decode("ascii")
    store_annotated_image(session_id, annotated_b64)
    logger.info(
        "[Annotation] Stored annotated image (%d chars b64) under session %s",
        len(annotated_b64),
        session_id,
    )

    # 5. Persist the annotated image as an ADK artifact + session metadata
    labels = [d.get("label", "region") for d in detections]
    try:
        ts = time.time()
        artifact_name = f"annotated_{int(ts * 1000)}.jpg"
        artifact_part = types.Part.from_bytes(
            data=annotated_bytes, mime_type="image/jpeg"
        )
        version = await tool_context.save_artifact(artifact_name, artifact_part)
        logger.info(
            "[Annotation] Saved artifact %s (version %d)", artifact_name, version
        )

        processed_frames: list = tool_context.state.get("processed_frames", [])
        processed_frames.append(
            {
                "artifact_name": artifact_name,
                "version": version,
                "timestamp": ts,
                "context": query[:500],
                "findings": f"Annotated {len(detections)} region(s): {', '.join(labels)}",
                "relevance": "high",
                "type": "annotated_frame",
                "labels": labels,
            }
        )
        tool_context.state["processed_frames"] = processed_frames
    except Exception as e:
        # Non-fatal — the annotated image is still delivered to the client
        logger.error(
            "[Annotation] Artifact/state persistence failed: %s", e, exc_info=True
        )

    return {
        "status": "success",
        "description": (
            f"Marked {len(detections)} region(s) on the image: {', '.join(labels)}. "
            "The annotated image is being delivered to the user. "
            "Note: if the image fails to display on the user's device, "
            "describe the location verbally as a fallback."
        ),
    }
