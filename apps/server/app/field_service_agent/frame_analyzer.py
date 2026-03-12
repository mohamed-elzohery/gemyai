"""Frame analysis tool — intelligent, on-demand image understanding.

Provides the ``capture_frame`` FunctionTool that the root agent calls when
it needs to *understand* what the user's camera is showing.  Internally it
pulls the latest frames from the shared ``FrameBuffer``, sends them to
``gemini-3-flash-preview`` with a rich context string, and returns
structured findings.  Processed frames are persisted as ADK artifacts with
metadata in session state for future report generation.

This is deliberately a plain ``FunctionTool`` rather than an ``AgentTool``
because the analysis is a single-shot vision call — wrapping it in a full
sub-agent loop would add latency without benefit.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time

from google import genai
from google.adk.tools import ToolContext
from google.genai import types

from .frame_buffer import get_recent_frames

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Vision model (same as visual grounding by default)
# ---------------------------------------------------------------------------
ANALYZER_MODEL = os.getenv("ANALYZER_MODEL", "gemini-3-flash-preview")

# Lazy-init Gemini client
_genai_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client()
    return _genai_client


# ---------------------------------------------------------------------------
# The ADK FunctionTool
# ---------------------------------------------------------------------------


async def capture_frame(context: str, tool_context: ToolContext) -> dict:
    """Analyze the latest camera frames to understand what the user is showing.

    Call this tool when you need to **see and understand** what the user's
    camera is pointing at — for example when they say "look at this",
    "what do you see?", "I opened the cover", or whenever visual
    information would help you help them.

    Do NOT call this for every message — only when the conversation
    indicates that visual context is needed.

    Args:
        context: A rich description of *why* you need to look and *what*
            to look for.  Example: "The user said 'what about this' while
            showing the inside of the printer.  They were asked to open
            the top cover.  Check whether the cover is open and identify
            any visible issues such as paper jams or broken parts."
        tool_context: Injected by ADK — provides session & artifact access.

    Returns:
        A dict with ``status``, ``description``, ``findings``, and
        ``key_observations``.
    """
    session_id = tool_context.state.get("ws_session_id", tool_context.session.id)
    logger.info(
        "[FrameAnalyzer] capture_frame called — session=%s, context=%s",
        session_id,
        context[:120],
    )

    # ------------------------------------------------------------------
    # 1. Pull the latest frames from the buffer
    # ------------------------------------------------------------------
    recent = get_recent_frames(session_id, count=3)
    if not recent:
        logger.warning("[FrameAnalyzer] No frames in buffer for session %s", session_id)
        return {
            "status": "error",
            "description": (
                "No camera frames are available. "
                "Ask the user to make sure their camera is on."
            ),
        }

    frame_timestamps = [ts for ts, _ in recent]
    frame_bytes_list = [fb for _, fb in recent]
    logger.info(
        "[FrameAnalyzer] Got %d frame(s), newest %.1fs ago",
        len(frame_bytes_list),
        time.time() - frame_timestamps[-1],
    )

    # ------------------------------------------------------------------
    # 2. Build the vision prompt
    # ------------------------------------------------------------------
    n_frames = len(frame_bytes_list)
    prompt = (
        "You are an expert visual analysis assistant helping a field-service "
        "technician through a live camera feed. You are given "
        f"{n_frames} sequential camera frame(s) (most recent last).\n\n"
        "## Context from the conversation\n"
        f"{context}\n\n"
        "## Your task\n"
        "Analyze the frames carefully and:\n"
        "1. Describe what you see — equipment type, brand markings, "
        "visible components, condition, any anomalies.\n"
        "2. Assess relevance to the context above — is the user showing "
        "what was discussed?\n"
        "3. Identify any issues, damage, wear, misalignment, missing "
        "parts, error indicators, or anything noteworthy.\n"
        "4. Note any changes between frames if multiple are provided.\n\n"
        "Return a JSON object with these fields:\n"
        '  "description": brief overall description of the scene,\n'
        '  "findings": detailed analysis relevant to the context,\n'
        '  "relevance": "high" | "medium" | "low",\n'
        '  "key_observations": list of concise observation strings,\n'
        '  "issues_detected": list of potential problems spotted (empty list if none)\n'
    )

    # Build multimodal content parts: frames first, then prompt
    content_parts: list[types.Part] = []
    for i, fb in enumerate(frame_bytes_list):
        content_parts.append(types.Part.from_bytes(data=fb, mime_type="image/jpeg"))
    content_parts.append(types.Part.from_text(text=prompt))

    # Structured output schema
    analysis_schema = genai.types.Schema(
        type="OBJECT",
        properties={
            "description": genai.types.Schema(type="STRING"),
            "findings": genai.types.Schema(type="STRING"),
            "relevance": genai.types.Schema(
                type="STRING", enum=["high", "medium", "low"]
            ),
            "key_observations": genai.types.Schema(
                type="ARRAY",
                items=genai.types.Schema(type="STRING"),
            ),
            "issues_detected": genai.types.Schema(
                type="ARRAY",
                items=genai.types.Schema(type="STRING"),
            ),
        },
        required=[
            "description",
            "findings",
            "relevance",
            "key_observations",
            "issues_detected",
        ],
    )

    # ------------------------------------------------------------------
    # 3. Call Vision model
    # ------------------------------------------------------------------
    try:
        client = _get_client()
        logger.info(
            "[FrameAnalyzer] Calling %s with %d frame(s) …",
            ANALYZER_MODEL,
            n_frames,
        )
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=ANALYZER_MODEL,
                contents=content_parts,
                config=genai.types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=analysis_schema,
                ),
            ),
            timeout=30.0,
        )
        raw_text = response.text.strip() if response.text else ""
        logger.info("[FrameAnalyzer] Model response: %s", raw_text[:300])

        if not raw_text:
            return {
                "status": "error",
                "description": (
                    "The vision model returned an empty response. "
                    "The camera image may be unclear — ask the user "
                    "to adjust the camera angle or lighting."
                ),
            }

        analysis: dict = json.loads(raw_text)

    except asyncio.TimeoutError:
        logger.error("[FrameAnalyzer] Vision model timed out after 30s")
        return {
            "status": "error",
            "description": (
                "Frame analysis timed out. Try again or ask the user "
                "to describe what they see."
            ),
        }
    except Exception as e:
        logger.error("[FrameAnalyzer] Vision model call failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "description": f"Frame analysis failed: {e}",
        }

    # ------------------------------------------------------------------
    # 4. Persist the most recent frame as an artifact + store metadata
    # ------------------------------------------------------------------
    try:
        ts = frame_timestamps[-1]
        artifact_name = f"frame_{int(ts * 1000)}.jpg"
        frame_part = types.Part.from_bytes(
            data=frame_bytes_list[-1], mime_type="image/jpeg"
        )
        version = await tool_context.save_artifact(artifact_name, frame_part)
        logger.info(
            "[FrameAnalyzer] Saved artifact %s (version %d)", artifact_name, version
        )

        # Append metadata to session state
        processed_frames: list = tool_context.state.get("processed_frames", [])
        processed_frames.append(
            {
                "artifact_name": artifact_name,
                "version": version,
                "timestamp": ts,
                "context": context[:500],
                "findings": analysis.get("findings", "")[:500],
                "relevance": analysis.get("relevance", "unknown"),
                "type": "user_frame",
                "key_observations": analysis.get("key_observations", []),
                "issues_detected": analysis.get("issues_detected", []),
            }
        )
        tool_context.state["processed_frames"] = processed_frames
        logger.info(
            "[FrameAnalyzer] Updated session state — %d processed frame(s) total",
            len(processed_frames),
        )
    except Exception as e:
        # Non-fatal — analysis result is still returned even if storage fails
        logger.error(
            "[FrameAnalyzer] Artifact/state persistence failed: %s",
            e,
            exc_info=True,
        )

    # ------------------------------------------------------------------
    # 5. Return findings to the root agent
    # ------------------------------------------------------------------
    return {
        "status": "success",
        "description": analysis.get("description", ""),
        "findings": analysis.get("findings", ""),
        "relevance": analysis.get("relevance", "unknown"),
        "key_observations": analysis.get("key_observations", []),
        "issues_detected": analysis.get("issues_detected", []),
    }
