"""Shared frame buffer — stores the latest camera frames per session.

Replaces the scattered module-level dicts that were previously duplicated
across visual_grounding.py.  Both ``annotate_image`` (bounding-box tool)
and ``capture_frame`` (frame-analysis tool) read from this single buffer.

Design choices
--------------
* **Rolling window of 5 frames** (configurable via ``BUFFER_MAX_FRAMES``).
* Frames are timestamped on arrival so downstream consumers can reason
  about recency.
* A separate ``_annotated_images`` store holds base64-encoded annotated
  JPEGs that await delivery to the client via the WebSocket
  ``image_delivery_task``.
* Thread-safe — all access is guarded by ``threading.Lock``.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BUFFER_MAX_FRAMES = 5  # rolling window size per session

# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------
_lock = threading.Lock()

# session_id -> deque of (unix_timestamp, jpeg_bytes)
_frame_buffers: dict[str, deque[tuple[float, bytes]]] = {}

# session_id -> base64-encoded annotated JPEG awaiting delivery
_annotated_images: dict[str, str] = {}

# session_id -> PDF bytes awaiting delivery to the client
_pending_reports: dict[str, bytes] = {}


# ---------------------------------------------------------------------------
# Frame storage
# ---------------------------------------------------------------------------


def store_frame(session_id: str, image_bytes: bytes) -> None:
    """Append a camera frame to the rolling buffer for *session_id*.

    Trims the buffer to ``BUFFER_MAX_FRAMES`` (FIFO).
    """
    with _lock:
        buf = _frame_buffers.setdefault(session_id, deque(maxlen=BUFFER_MAX_FRAMES))
        buf.append((time.time(), image_bytes))
    logger.debug(
        "[FrameBuffer] Stored frame for session %s (buffer size: %d)",
        session_id,
        len(buf),
    )


# ---------------------------------------------------------------------------
# Frame retrieval
# ---------------------------------------------------------------------------


def get_recent_frames(session_id: str, count: int = 3) -> list[tuple[float, bytes]]:
    """Return the most recent *count* frames as ``(timestamp, jpeg_bytes)``.

    Falls back to any available session when the exact ID is missing
    (handles the ADK runner session-ID mismatch gracefully).
    """
    with _lock:
        buf = _frame_buffers.get(session_id)
        if not buf:
            # Fallback — try any session
            if _frame_buffers:
                fallback_sid = next(iter(_frame_buffers))
                buf = _frame_buffers.get(fallback_sid)
                logger.info(
                    "[FrameBuffer] Session %s not found — falling back to %s",
                    session_id,
                    fallback_sid,
                )
            if not buf:
                return []
        return list(buf)[-count:]


def get_latest_frame(session_id: str) -> bytes | None:
    """Return the single most-recent JPEG for *session_id* (non-destructive).

    Convenience wrapper used by ``annotate_image``.
    """
    frames = get_recent_frames(session_id, count=1)
    if frames:
        return frames[-1][1]  # (timestamp, bytes) -> bytes
    return None


# ---------------------------------------------------------------------------
# Annotated-image store (for WebSocket delivery)
# ---------------------------------------------------------------------------


def store_annotated_image(session_id: str, b64_jpeg: str) -> None:
    """Save the annotated image for later delivery to the client."""
    with _lock:
        _annotated_images[session_id] = b64_jpeg
    logger.info(
        "[FrameBuffer] Stored annotated image (%d chars b64) for session %s",
        len(b64_jpeg),
        session_id,
    )


def pop_annotated_image(session_id: str) -> str | None:
    """Pop and return the annotated image for *session_id*, if any.

    Falls back to any available annotated image (handles session-ID
    mismatch).
    """
    with _lock:
        result = _annotated_images.pop(session_id, None)
        if result:
            return result
        if _annotated_images:
            fallback_sid, result = _annotated_images.popitem()
            logger.info(
                "[FrameBuffer] Annotated image session mismatch — "
                "requested %s, found under %s",
                session_id,
                fallback_sid,
            )
            return result
        return None


# ---------------------------------------------------------------------------
# Pending-report store (for WebSocket delivery of generated PDFs)
# ---------------------------------------------------------------------------


def store_pending_report(session_id: str, pdf_bytes: bytes) -> None:
    """Save a generated PDF report for later delivery to the client."""
    with _lock:
        _pending_reports[session_id] = pdf_bytes
    logger.info(
        "[FrameBuffer] Stored pending report (%d bytes) for session %s",
        len(pdf_bytes),
        session_id,
    )


def pop_pending_report(session_id: str) -> bytes | None:
    """Pop and return the pending PDF report for *session_id*, if any.

    Falls back to any available pending report (handles session-ID
    mismatch).
    """
    with _lock:
        result = _pending_reports.pop(session_id, None)
        if result:
            return result
        if _pending_reports:
            fallback_sid, result = _pending_reports.popitem()
            logger.info(
                "[FrameBuffer] Pending report session mismatch — "
                "requested %s, found under %s",
                session_id,
                fallback_sid,
            )
            return result
        return None


# ---------------------------------------------------------------------------
# Housekeeping
# ---------------------------------------------------------------------------


def clear_session(session_id: str) -> None:
    """Remove all frame data for a session (call on disconnect)."""
    with _lock:
        _frame_buffers.pop(session_id, None)
        _annotated_images.pop(session_id, None)
        _pending_reports.pop(session_id, None)
    logger.info("[FrameBuffer] Cleared data for session %s", session_id)
