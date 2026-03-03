"""FastAPI application demonstrating ADK Gemini Live API Toolkit with WebSocket."""

import asyncio
import base64
import json
import logging
import warnings
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import InMemoryArtifactService
from google.genai import types

# Load environment variables from .env file BEFORE importing agent
load_dotenv(Path(__file__).parent / ".env")

# Import agent after loading environment variables
# pylint: disable=wrong-import-position
from field_service_agent.agent import agent  # noqa: E402
from field_service_agent.visual_grounding import (  # noqa: E402
    get_annotated_image,
    store_latest_image,
)

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
# Let sub-agent tool logs through
logging.getLogger("field_service_agent.tools").setLevel(logging.DEBUG)

# Suppress Pydantic serialization warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

# Application name constant
APP_NAME = "bidi-demo"

# Internal tool names used by the field-service agent
_INTERNAL_TOOLS = {
    "annotate_image",
    "start_diagnosis",
    "submit_diagnosis_answer",
    "create_fix_plan",
    "replan_fix",
    "get_current_step",
    "report_step_result",
}

_TOOL_STATUS_MESSAGES = {
    "annotate_image": "Pointing to the parts...",
    "start_diagnosis": "Starting diagnosis...",
    "submit_diagnosis_answer": "Processing your answer...",
    "create_fix_plan": "Creating a repair plan...",
    "replan_fix": "Adjusting the plan...",
    "get_current_step": "Loading the next step...",
    "report_step_result": "Recording step result...",
}


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
    # References to internal tool names in planning context
    for tool_name in _INTERNAL_TOOLS:
        if tool_name in text:
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

# Mount static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

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


@app.get("/")
async def root():
    """Serve the index.html page."""
    return FileResponse(Path(__file__).parent / "static" / "index.html")


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
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=True
                )
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                ),
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
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=True
                )
            ),
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
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    if not session:
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
            state={
                "phase": "intake",
                "problem_image_count": 0,
                "step_results": "{}",
                "diagnosis_history": "[]",
                "diagnosis_status": "not_started",
                "current_diagnosis_question": "",
            },
        )
    live_request_queue = LiveRequestQueue()

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

                # Handle activity signals (client-side VAD)
                if json_message.get("type") == "activity_start":
                    live_request_queue.send_activity_start()

                elif json_message.get("type") == "activity_end":
                    live_request_queue.send_activity_end()

                # Extract text from JSON and send to LiveRequestQueue
                elif json_message.get("type") == "text":
                    content = types.Content(
                        parts=[types.Part(text=json_message["text"])]
                    )
                    live_request_queue.send_content(content)

                # Handle image data
                elif json_message.get("type") == "image":
                    # Decode base64 image data
                    image_data = base64.b64decode(json_message["data"])
                    mime_type = json_message.get("mimeType", "image/jpeg")

                    # Cache the latest camera frame for visual grounding
                    store_latest_image(session_id, image_data)

                    # Send image as blob
                    image_blob = types.Blob(mime_type=mime_type, data=image_data)
                    live_request_queue.send_realtime(image_blob)

    async def downstream_task() -> None:
        """Receives Events from run_live() and sends to WebSocket."""
        async for event in runner.run_live(
            user_id=user_id,
            session_id=session_id,
            live_request_queue=live_request_queue,
            run_config=run_config,
        ):
            event_json = event.model_dump_json(exclude_none=True, by_alias=True)

            skip_event = False
            if event.content and event.content.parts:
                for part in event.content.parts:
                    # --- 1. Intercept function_call events for internal tools ---
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
                        skip_event = True

                    # --- 2. Intercept function_response events ---
                    if (
                        part.function_response
                        and part.function_response.name in _INTERNAL_TOOLS
                    ):
                        skip_event = True
                        # Deliver annotated image immediately on annotate_image response
                        if part.function_response.name == "annotate_image":
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
                await websocket.send_text(event_json)

    async def image_delivery_task() -> None:
        """Polls for annotated images and sends them to the client.

        Runs independently of the ADK event stream so the image is
        delivered as soon as the visual-grounding tool produces it,
        regardless of whether an ADK event happens to be yielded at
        the right moment.
        """
        while True:
            await asyncio.sleep(0.3)
            annotated_b64 = get_annotated_image(session_id)
            if annotated_b64:
                logger.info(
                    "[Annotation] Sending annotated image to client " "(%d chars b64)",
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

    # Run both tasks concurrently
    # Exceptions from either task will propagate and cancel the other task
    try:
        await asyncio.gather(upstream_task(), downstream_task(), image_delivery_task())
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
