"""FastAPI application demonstrating ADK Gemini Live API Toolkit with WebSocket."""

import asyncio
import base64
import json
import logging
import os
import warnings
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import InMemoryArtifactService
from google.genai import types
from websockets.exceptions import ConnectionClosedError as _WSClosedError

# Load environment variables from .env file BEFORE importing agent
load_dotenv(Path(__file__).parent / ".env")

# Import agent after loading environment variables
# pylint: disable=wrong-import-position
from field_service_agent.agent import agent  # noqa: E402
from field_service_agent.visual_grounding import get_annotated_image  # noqa: E402
from field_service_agent.frame_buffer import (
    store_frame,
    pop_pending_report,
)  # noqa: E402
from auth import (  # noqa: E402
    verify_google_token,
    create_jwt,
    get_current_user,
    get_ws_user,
    COOKIE_NAME,
    JWT_EXPIRY_DAYS,
)
from user_service import get_or_create_user  # noqa: E402

# Configure logging — quiet by default, verbose for the annotation flow
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
# Show annotation-related INFO logs from this module
logger.setLevel(logging.INFO)
# Let visual-grounding logs through so we can trace the annotation pipeline
logging.getLogger("field_service_agent.visual_grounding").setLevel(logging.DEBUG)
# Let frame-buffer and frame-analyzer logs through
logging.getLogger("field_service_agent.frame_buffer").setLevel(logging.DEBUG)
logging.getLogger("field_service_agent.frame_analyzer").setLevel(logging.DEBUG)
# Let auth / user-service logs through
logging.getLogger("auth").setLevel(logging.INFO)
logging.getLogger("user_service").setLevel(logging.INFO)

# Suppress Pydantic serialization warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

# Application name constant
APP_NAME = "bidi-demo"

# Tool names whose function_call / function_response events should be
# intercepted (show status messages to client instead of raw ADK events).
_INTERNAL_TOOLS = {
    "annotate_image",
    "capture_frame",
    "google_search",
    "generate_fix_report",
}

_TOOL_STATUS_MESSAGES = {
    "annotate_image": "Pointing to the parts...",
    "capture_frame": "Analyzing the camera feed...",
    "google_search": "Searching the web...",
    "generate_fix_report": "Generating your report...",
}

# Recovery prompt used after transparent session reconnection (1011 retry).
_RECOVERY_PROMPT = (
    "Continue helping with the current task. " "Do not greet or re-introduce yourself."
)


def _is_thinking_text(text: str) -> bool:
    """Return True if *text* looks like internal model reasoning/planning.

    These leaked chain-of-thought fragments should be suppressed so the
    user only sees natural conversational responses.
    """
    if not text or not text.strip():
        return False
    stripped = text.strip()
    # Bold-markdown headers (e.g. "**Acknowledging New Method**")
    if stripped.startswith("**") and "**" in stripped[2:]:
        return True
    # Common reasoning phrases that should not be shown to user
    _REASONING_MARKERS = [
        "my next step is",
        "i'm going to call",
        "i will now call",
        "i'll call the",
        "i need to call",
        "let me call",
        "i'm ready to",
        "following this,",
        "i've acknowledged",
        "i should now",
        "the next action is",
    ]
    lower = text.lower()
    for marker in _REASONING_MARKERS:
        if marker in lower:
            return True
    return False


# ========================================
# Phase 1: Application Initialization (once at startup)
# ========================================

app = FastAPI()

# Static directory – populated by the Vite build (apps/client → apps/server/app/static)
static_dir = Path(__file__).parent / "static"

# Define your session and artifact services
session_service = InMemorySessionService()
artifact_service = InMemoryArtifactService()

# Define your runner
runner = Runner(
    app_name=APP_NAME,
    agent=agent,
    session_service=session_service,
    artifact_service=artifact_service,
)

# ========================================
# HTTP Endpoints
# ========================================

_index_html = static_dir / "index.html"


@app.get("/")
async def root():
    """Serve the SPA index.html page."""
    return FileResponse(_index_html)


# ---- SPA catch-all (registered AFTER /ws below) ----
# We define it as a plain function and register it after the WebSocket route
# so that /ws takes priority.
async def _spa_fallback(full_path: str):
    """Return index.html for any path not matched by /ws or /static."""
    if _index_html.exists():
        return FileResponse(_index_html)
    return FileResponse(static_dir / "index.html")


# ========================================
# Auth Endpoints
# ========================================


@app.post("/api/auth/google")
async def auth_google(request: Request):
    """Exchange a Google ID token for a session cookie."""
    body = await request.json()
    credential = body.get("credential")
    if not credential:
        return JSONResponse({"error": "Missing credential"}, status_code=400)

    # Verify the Google ID token (raises HTTPException on failure)
    idinfo = verify_google_token(credential)

    # Persist user in Firestore (best-effort — don't let DB errors block login)
    try:
        user = get_or_create_user(
            google_id=idinfo["sub"],
            email=idinfo.get("email", ""),
            name=idinfo.get("name", ""),
            picture=idinfo.get("picture", ""),
        )
    except Exception as db_exc:
        # Log the real error but fall back to token data so login still works
        logger.error(
            "Firestore user upsert failed (using token data as fallback): %s",
            db_exc,
            exc_info=True,
        )
        user = {
            "google_id": idinfo["sub"],
            "email": idinfo.get("email", ""),
            "name": idinfo.get("name", ""),
            "picture": idinfo.get("picture", ""),
        }

    # Create session JWT
    token = create_jwt(
        user_id=idinfo["sub"],
        email=user["email"],
        name=user["name"],
        picture=user["picture"],
    )

    response = JSONResponse(
        {
            "user": {
                "id": idinfo["sub"],
                "email": user["email"],
                "name": user["name"],
                "picture": user["picture"],
            }
        }
    )
    is_production = os.getenv("ENVIRONMENT", "").lower() == "production"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_production,
        samesite="none" if is_production else "lax",
        max_age=JWT_EXPIRY_DAYS * 86400,
        path="/",
    )
    return response


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user from the session cookie."""
    return {
        "user": {
            "id": user["sub"],
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "picture": user.get("picture", ""),
        }
    }


@app.post("/api/auth/logout")
async def auth_logout():
    """Clear the session cookie."""
    response = JSONResponse({"ok": True})
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return response


# ========================================
# WebSocket Endpoint
# ========================================


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    session_id: str,
    proactivity: bool = False,
    affective_dialog: bool = False,
) -> None:
    """WebSocket endpoint for bidirectional streaming with ADK.

    Args:
        websocket: The WebSocket connection
        user_id: User identifier
        session_id: Session identifier
        proactivity: Enable proactive audio (native audio models only)
        affective_dialog: Enable affective dialog (native audio models only)
    """
    logger.debug(
        f"WebSocket connection request: user_id={user_id}, session_id={session_id}, "
        f"proactivity={proactivity}, affective_dialog={affective_dialog}"
    )

    # --- Authenticate via session cookie ---
    ws_user = get_ws_user(websocket)
    if ws_user is None:
        logger.warning("WebSocket auth failed — no valid session cookie")
        await websocket.close(code=4001, reason="Not authenticated")
        return
    # Override user_id with the authenticated Google ID
    user_id = ws_user["sub"]
    logger.info(
        "WebSocket authenticated as %s <%s>", ws_user.get("name"), ws_user.get("email")
    )

    await websocket.accept()

    # ========================================
    # Phase 2: Session Initialization (once per streaming session)
    # ========================================

    # Automatically determine response modality based on model architecture
    # Native audio models (containing "native-audio" in name)
    # ONLY support AUDIO response modality.
    # Half-cascade models support both TEXT and AUDIO,
    # we default to TEXT for better performance.
    model_name = agent.model
    is_native_audio = "native-audio" in model_name.lower()

    if is_native_audio:
        # Native audio models require AUDIO response modality
        # with audio transcription
        response_modalities = ["AUDIO"]

        # Build RunConfig with optional proactivity and affective dialog
        # These features are only supported on native audio models
        run_config = RunConfig(
            streaming_mode=StreamingMode.BIDI,
            response_modalities=response_modalities,
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Sadaltager"
                    )
                ),
            ),
            # Disable automatic (server-side) VAD — the client runs Silero
            # VAD and sends activity_start / activity_end signals.
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=True
                )
            ),
            proactivity=(
                types.ProactivityConfig(proactive_audio=True) if proactivity else None
            ),
            enable_affective_dialog=affective_dialog if affective_dialog else None,
        )
    else:
        # Half-cascade models support TEXT response modality
        # for faster performance
        response_modalities = ["TEXT"]
        run_config = RunConfig(
            streaming_mode=StreamingMode.BIDI,
            response_modalities=response_modalities,
            input_audio_transcription=None,
            output_audio_transcription=None,
        )
        # Warn if user tried to enable native-audio-only features
        if proactivity or affective_dialog:
            logger.warning(
                f"Proactivity and affective dialog are only supported on native "
                f"audio models. Current model: {model_name}. "
                f"These settings will be ignored."
            )
    logger.debug(f"RunConfig created: {run_config}")

    # Get or create session (handles both new sessions and reconnections)
    is_new_session = False
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    if not session:
        is_new_session = True
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
            state={"ws_session_id": session_id},
        )
    else:
        # Ensure ws_session_id is set for reconnections
        session.state["ws_session_id"] = session_id
    live_request_queue = LiveRequestQueue()

    # ========================================
    # Phase 2b: Send welcome message (new sessions only)
    # ========================================
    _WELCOME_TEXT = (
        "Hey, I am Gemmy! I can help you fix your stuff. " "What do we have today?"
    )

    if is_new_session:
        await websocket.send_text(
            json.dumps({"type": "welcome", "text": _WELCOME_TEXT})
        )
        logger.info("[Welcome] Sent welcome text to client (new session)")

        # Queue a greeting prompt so the native-audio model speaks the welcome
        live_request_queue.send_content(
            types.Content(
                parts=[
                    types.Part(
                        text=(
                            "The user just connected. Greet them warmly. "
                            "Say exactly: " + _WELCOME_TEXT
                        )
                    )
                ]
            )
        )
    else:
        logger.info("[Reconnect] Existing session restored — skipping welcome")
        # Inject a recovery prompt so the model continues naturally
        live_request_queue.send_content(
            types.Content(
                parts=[types.Part(text=_RECOVERY_PROMPT)],
                role="user",
            )
        )

    # ========================================
    # Phase 3: Active Session (concurrent bidirectional communication)
    # ========================================

    async def upstream_task() -> None:
        """Receives messages from WebSocket and sends to LiveRequestQueue."""
        while True:
            # Receive message from WebSocket (text or binary)
            message = await websocket.receive()

            # Handle binary frames (audio data)
            if "bytes" in message:
                audio_data = message["bytes"]
                audio_blob = types.Blob(
                    mime_type="audio/pcm;rate=16000", data=audio_data
                )
                live_request_queue.send_realtime(audio_blob)

            # Handle text frames (JSON messages)
            elif "text" in message:
                text_data = message["text"]
                json_message = json.loads(text_data)

                # --- Activity signals (client-side VAD) ---
                if json_message.get("type") == "activity_start":
                    logger.info("[Upstream] ▲ activity_start (user speaking)")
                    live_request_queue.send_activity_start()

                elif json_message.get("type") == "activity_end":
                    logger.info("[Upstream] ▲ activity_end (user stopped)")
                    live_request_queue.send_activity_end()

                # Extract text from JSON and send to LiveRequestQueue
                elif json_message.get("type") == "text":
                    logger.info("[Upstream] ▲ text: %s", json_message["text"][:120])
                    content = types.Content(
                        parts=[types.Part(text=json_message["text"])]
                    )
                    live_request_queue.send_content(content)

                # Handle image data — buffer AND send inline to model
                elif json_message.get("type") == "image":
                    # Decode base64 image data
                    image_data = base64.b64decode(json_message["data"])
                    mime_type = json_message.get("mimeType", "image/jpeg")
                    logger.info(
                        "[Upstream] ▲ image (%s, %d bytes) → buffer + model",
                        mime_type,
                        len(image_data),
                    )

                    # Store in the shared frame buffer (used by
                    # capture_frame / annotate_image tools on demand)
                    store_frame(session_id, image_data)

                    # Also send inline to the native audio model so it
                    # has casual visual context during the user's speech
                    image_blob = types.Blob(mime_type=mime_type, data=image_data)
                    live_request_queue.send_realtime(image_blob)
                    logger.info(
                        "[Upstream] Image queued to model (%d bytes, session %s)",
                        len(image_data),
                        session_id,
                    )

                else:
                    logger.info(
                        "[Upstream] ▲ unknown json type: %s", json_message.get("type")
                    )

    # ----- Retry wrapper for Gemini Live connection -----
    _MAX_LIVE_RETRIES = 3

    async def _live_event_stream():
        """Yield events from run_live, retrying on transient Gemini errors.

        The Gemini native-audio preview model occasionally crashes with
        a 1011 (internal error) or 1008 (policy violation) WebSocket
        close — typically mid-conversation during extended sessions.
        This wrapper catches the error, notifies the client, waits
        briefly, injects a recovery prompt, and restarts run_live().
        """
        _RETRYABLE_CODES = {1008, 1011}
        for attempt in range(_MAX_LIVE_RETRIES + 1):
            try:
                async for event in runner.run_live(
                    user_id=user_id,
                    session_id=session_id,
                    live_request_queue=live_request_queue,
                    run_config=run_config,
                ):
                    yield event
                return  # generator completed normally
            except (_WSClosedError, ValueError) as exc:
                code = None
                if isinstance(exc, _WSClosedError):
                    rcvd = getattr(exc, "rcvd", None)
                    code = rcvd.code if rcvd else None
                is_retryable = (
                    code in _RETRYABLE_CODES
                    if code is not None
                    else "not implemented" in str(exc).lower()
                    or "not supported" in str(exc).lower()
                )
                if is_retryable and attempt < _MAX_LIVE_RETRIES:
                    logger.warning(
                        "[Retry] Gemini connection error (code=%s) — "
                        "reconnecting (attempt %d/%d)",
                        code,
                        attempt + 1,
                        _MAX_LIVE_RETRIES,
                    )
                    # Notify the client (best-effort; their WS may be gone)
                    try:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "agent_status",
                                    "tool": "reconnect",
                                    "message": "Brief connection hiccup — reconnecting…",
                                }
                            )
                        )
                    except Exception:
                        pass
                    await asyncio.sleep(1.0)
                    # Inject a recovery prompt so the model continues
                    # naturally instead of re-greeting.
                    live_request_queue.send_content(
                        types.Content(
                            parts=[types.Part(text=_RECOVERY_PROMPT)],
                            role="user",
                        )
                    )
                    continue  # retry run_live
                raise  # non-retryable — propagate

    async def downstream_task() -> None:
        """Receives Events from run_live() and sends to WebSocket."""

        async for event in _live_event_stream():
            event_json = event.model_dump_json(exclude_none=True, by_alias=True)

            skip_event = False
            if event.content and event.content.parts:
                for part in event.content.parts:
                    # --- 1. Intercept function_call events for internal tools ---
                    # NOTE: With native audio BIDI streaming, ADK executes
                    # tools internally and does NOT yield function_call /
                    # function_response events in the downstream stream.
                    # This interception code only activates with half-cascade
                    # models.  For native-audio, the delivery_task handles
                    # annotated-image and report delivery via polling.
                    if (
                        part.function_call
                        and part.function_call.name in _INTERNAL_TOOLS
                    ):
                        tool_name = part.function_call.name
                        logger.info(
                            "[Tools] Detected %s function_call event", tool_name
                        )
                        status_msg = _TOOL_STATUS_MESSAGES.get(
                            tool_name, "Working on it..."
                        )
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "agent_status",
                                    "tool": tool_name,
                                    "message": status_msg,
                                }
                            )
                        )
                        # We no longer skip_event here so spoken text in the same event is not lost.

                    # --- 2. Intercept function_response events ---
                    if (
                        part.function_response
                        and part.function_response.name in _INTERNAL_TOOLS
                    ):
                        tool_resp_name = part.function_response.name
                        logger.info(
                            "[Downstream] Detected function_response for %s",
                            tool_resp_name,
                        )

                        # Send tool_complete event so client knows the tool finished
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "tool_complete",
                                    "tool": tool_resp_name,
                                    "message": f"{_TOOL_STATUS_MESSAGES.get(tool_resp_name, 'Done')} Done.",
                                }
                            )
                        )

                        # Deliver annotated image immediately on annotate_image response
                        if tool_resp_name == "annotate_image":
                            annotated_b64 = get_annotated_image(session_id)
                            if annotated_b64:
                                logger.info(
                                    "[Annotation] Delivering annotated image "
                                    "via downstream (sync, %d chars b64)",
                                    len(annotated_b64),
                                )
                                await websocket.send_text(
                                    json.dumps(
                                        {
                                            "type": "grounding_result",
                                            "image": annotated_b64,
                                            "mimeType": "image/jpeg",
                                        }
                                    )
                                )
                            else:
                                logger.warning(
                                    "[Annotation] annotate_image response received "
                                    "but no annotated image found for session %s",
                                    session_id,
                                )
                                # Notify client that annotation failed
                                await websocket.send_text(
                                    json.dumps(
                                        {
                                            "type": "annotation_failed",
                                            "message": (
                                                "Could not highlight the image. "
                                                "Try pointing the camera closer to the area."
                                            ),
                                        }
                                    )
                                )

                        # Deliver PDF report on generate_fix_report response
                        if tool_resp_name == "generate_fix_report":
                            report_pdf = pop_pending_report(session_id)
                            if report_pdf:
                                logger.info(
                                    "[Report] Delivering PDF report "
                                    "via downstream (%d bytes)",
                                    len(report_pdf),
                                )
                                await websocket.send_text(
                                    json.dumps(
                                        {
                                            "type": "report_ready",
                                            "data": base64.b64encode(report_pdf).decode(
                                                "ascii"
                                            ),
                                            "mimeType": "application/pdf",
                                            "filename": "fix_report.pdf",
                                        }
                                    )
                                )
                            else:
                                logger.warning(
                                    "[Report] generate_fix_report response received "
                                    "but no pending report for session %s",
                                    session_id,
                                )

                    # --- 3. Filter thinking / reasoning text ---
                    if part.text and _is_thinking_text(part.text):
                        logger.info(
                            "[Filter] Suppressed thinking text: %s",
                            part.text[:120],
                        )
                        skip_event = True

                    # --- 4. Filter thought-tagged parts (belt-and-suspenders) ---
                    if hasattr(part, "thought") and part.thought:
                        skip_event = True

            if not skip_event:
                # Log the downstream event for debugging
                try:
                    evt_summary = json.loads(event_json)
                    parts_info = ""
                    if "content" in evt_summary and evt_summary["content"]:
                        parts = evt_summary["content"].get("parts", [])
                        part_types = []
                        for p in parts:
                            if "text" in p:
                                part_types.append(f"text({len(p['text'])}ch)")
                            elif "inlineData" in p:
                                mime = p["inlineData"].get("mimeType", "?")
                                part_types.append(f"data({mime})")
                            elif "functionCall" in p:
                                part_types.append(
                                    f"fn_call({p['functionCall'].get('name','?')})"
                                )
                            elif "functionResponse" in p:
                                part_types.append(
                                    f"fn_resp({p['functionResponse'].get('name','?')})"
                                )
                        parts_info = f" parts=[{', '.join(part_types)}]"
                    flags = []
                    if evt_summary.get("turnComplete"):
                        flags.append("turnComplete")
                    if evt_summary.get("interrupted"):
                        flags.append("interrupted")
                    if evt_summary.get("partial"):
                        flags.append("partial")
                    if evt_summary.get("inputTranscription"):
                        txt = evt_summary["inputTranscription"].get("text", "")[:60]
                        fin = evt_summary["inputTranscription"].get("finished", False)
                        flags.append(f"inputTrans(fin={fin},'{txt}')")
                    if evt_summary.get("outputTranscription"):
                        txt = evt_summary["outputTranscription"].get("text", "")[:60]
                        fin = evt_summary["outputTranscription"].get("finished", False)
                        flags.append(f"outputTrans(fin={fin},'{txt}')")
                    flag_str = " " + " ".join(flags) if flags else ""
                    logger.info("[Downstream] ▼%s%s", parts_info, flag_str)
                except Exception:
                    logger.info("[Downstream] ▼ (raw event)")
                await websocket.send_text(event_json)

    # ------------------------------------------------------------------
    # Delivery task — polls for annotated images & PDF reports that
    # were produced by ADK tools.  With native-audio bidi streaming
    # the ADK runner executes tools internally and does NOT yield
    # function_call / function_response events in the downstream
    # stream, so the in-line delivery code inside downstream_task
    # never triggers.  This independent task closes that gap.
    # ------------------------------------------------------------------
    _DELIVERY_POLL_INTERVAL = 0.3  # seconds

    async def delivery_task() -> None:
        """Periodically deliver annotated images & reports to the client."""
        poll_count = 0
        while True:
            await asyncio.sleep(_DELIVERY_POLL_INTERVAL)
            poll_count += 1

            # Heartbeat every ~30s (100 polls at 300ms)
            if poll_count % 100 == 0:
                logger.info(
                    "[Delivery] heartbeat — alive, session=%s, %d polls",
                    session_id,
                    poll_count,
                )

            # --- Annotated image ---
            annotated_b64 = get_annotated_image(session_id)
            if annotated_b64:
                logger.info(
                    "[Delivery] Sending annotated image to client "
                    "(%d chars b64, session %s)",
                    len(annotated_b64),
                    session_id,
                )
                try:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "grounding_result",
                                "image": annotated_b64,
                                "mimeType": "image/jpeg",
                            }
                        )
                    )
                except Exception as exc:
                    logger.error("[Delivery] Failed to send annotated image: %s", exc)

            # --- PDF report ---
            report_pdf = pop_pending_report(session_id)
            if report_pdf:
                logger.info(
                    "[Delivery] Sending PDF report to client " "(%d bytes, session %s)",
                    len(report_pdf),
                    session_id,
                )
                try:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "report_ready",
                                "data": base64.b64encode(report_pdf).decode("ascii"),
                                "mimeType": "application/pdf",
                                "filename": "fix_report.pdf",
                            }
                        )
                    )
                except Exception as exc:
                    logger.error("[Delivery] Failed to send PDF report: %s", exc)

    # Run all three tasks concurrently
    # Exceptions from any task will propagate and cancel the others
    try:
        await asyncio.gather(upstream_task(), downstream_task(), delivery_task())
    except WebSocketDisconnect:
        logger.debug("Client disconnected normally")
    except Exception as e:
        logger.error(f"Unexpected error in streaming tasks: {e}", exc_info=True)
    finally:
        # ========================================
        # Phase 4: Session Termination
        # ========================================

        # Always close the queue, even if exceptions occurred
        logger.debug("Closing live_request_queue")
        live_request_queue.close()


# ========================================
# Static files & SPA fallback (registered AFTER /ws so WebSocket takes priority)
# ========================================

# Mount Vite build output as /static (JS/CSS/assets)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# SPA catch-all: serve index.html for any unmatched GET path
app.add_api_route("/{full_path:path}", _spa_fallback, methods=["GET"])
