import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type {
  ChatMessage,
  AdkEvent,
  AgentStatusEvent,
  GroundingResultEvent,
  AnnotationFailedEvent,
  WelcomeEvent,
  ReportReadyEvent,
} from "../types";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useCamera } from "../hooks/useCamera";
import { useVAD } from "../hooks/useVAD";
import { base64ToArray } from "../utils/audio";
import { cleanCJKSpaces, randomId } from "../utils/textHelpers";
import { useAuth } from "../contexts/AuthContext";

import SessionTopBar from "../components/SessionTopBar";
import SessionBottomBar from "../components/SessionBottomBar";
import ResponsePreview from "../components/ResponsePreview";
import type { ResponseState } from "../components/ResponsePreview";
import CameraPreview from "../components/CameraPreview";
import ChatPanel from "../components/ChatPanel";
import ConfirmDialog from "../components/ConfirmDialog";

export default function SessionPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";
  const { id: sessionId = "default" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ---- Session state ----
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const isAudioRef = useRef(false);

  // ---- Continuous 1 fps frame streaming (while camera is active) ----
  const frameStreamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // ---- Controls state ----
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [previewVisible, setPreviewVisible] = useState(true);

  // ---- Confirm dialog ----
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ---- Chat panel ----
  const [chatOpen, setChatOpen] = useState(false);

  // ---- Chat messages (kept for future chat panel) ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // ---- Tracking refs for partial message accumulation ----
  const currentMessageIdRef = useRef<string | null>(null);
  const currentInputTransIdRef = useRef<string | null>(null);
  const currentOutputTransIdRef = useRef<string | null>(null);
  const inputTransFinishedRef = useRef(false);
  const hasOutputTransInTurnRef = useRef(false);
  const agentStatusIdRef = useRef<string | null>(null);
  const groundingLoadingIdRef = useRef<string | null>(null);

  // ---- Helpers to update messages by ID ----
  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateMessage = useCallback(
    (id: string, updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
    },
    [],
  );

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ---- Audio hooks ----
  const audioPlayer = useAudioPlayer();
  const audioRecorder = useAudioRecorder();
  const camera = useCamera();

  // ---- VAD: client-side Silero voice activity detection ----
  const vad = useVAD({
    onSpeechStart: () => {
      console.log("[VAD] Speech START");
      // Layer 1 — LOCAL: immediately stop audio playback (barge-in)
      audioPlayer.stop();

      // Update speaking state
      isSpeakingRef.current = true;
      setIsSpeaking(true);

      // Layer 2 — REMOTE: tell the server the user started speaking
      sendJsonRef.current({ type: "activity_start" });

      // Start streaming PCM audio to server
      audioRecorder.resume();
    },
    onSpeechEnd: () => {
      console.log("[VAD] Speech END");

      // Update speaking state
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Tell the server the user stopped speaking
      sendJsonRef.current({ type: "activity_end" });

      // Stop streaming PCM audio
      audioRecorder.pause();
    },
  });

  // ---- Snapshot capture & send (continuous 1 fps while camera active) ----
  const sendJsonRef = useRef<(data: unknown) => void>(() => {});

  const captureAndSendSnapshot = useCallback(() => {
    const base64 = camera.captureSnapshot();
    if (!base64) return;
    sendJsonRef.current({
      type: "image",
      data: base64,
      mimeType: "image/jpeg",
    });
  }, [camera]);

  // ---- WebSocket message handler ----
  const handleWsMessage = useCallback(
    (parsed: unknown) => {
      const evt = parsed as Record<string, unknown>;
      const evtType =
        evt.type ??
        (evt.turnComplete
          ? "turnComplete"
          : evt.interrupted
            ? "interrupted"
            : evt.content
              ? "content"
              : "unknown");
      console.log(`[MSG] ${evtType}`, evt);

      // --- Agent status ---
      if (evt.type === "agent_status") {
        const e = evt as unknown as AgentStatusEvent;
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
        }
        const id = randomId();
        agentStatusIdRef.current = id;
        addMessage({
          id,
          type: "agent-status",
          text: e.message,
        });
        return;
      }

      // --- Tool complete (dismiss agent_status spinner) ---
      if (evt.type === "tool_complete") {
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
          agentStatusIdRef.current = null;
        }
        return;
      }

      // --- Annotation failed ---
      if (evt.type === "annotation_failed") {
        const e = evt as unknown as AnnotationFailedEvent;
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
          agentStatusIdRef.current = null;
        }
        addMessage({
          id: randomId(),
          type: "system",
          text: e.message,
        });
        return;
      }

      // --- Welcome message ---
      if (evt.type === "welcome") {
        const e = evt as unknown as WelcomeEvent;
        addMessage({
          id: randomId(),
          type: "output-transcription",
          text: e.text,
          isPartial: false,
        });
        return;
      }

      // --- Grounding loading ---
      if (evt.type === "grounding_status") {
        const id = randomId();
        groundingLoadingIdRef.current = id;
        addMessage({
          id,
          type: "grounding-loading",
          text: (evt as { message?: string }).message || "Processing...",
        });
        return;
      }

      // --- Grounding result ---
      if (evt.type === "grounding_result") {
        const e = evt as unknown as GroundingResultEvent;
        if (groundingLoadingIdRef.current) {
          removeMessage(groundingLoadingIdRef.current);
          groundingLoadingIdRef.current = null;
        }
        const dataUrl = `data:${e.mimeType || "image/jpeg"};base64,${e.image}`;
        addMessage({
          id: randomId(),
          type: "agent-image",
          imageUrl: dataUrl,
        });
        return;
      }

      // --- Report ready (downloadable PDF) ---
      if (evt.type === "report_ready") {
        const e = evt as unknown as ReportReadyEvent;
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
          agentStatusIdRef.current = null;
        }
        // Decode base64 → Blob → Object URL
        const raw = atob(e.data);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: e.mimeType || "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        addMessage({
          id: randomId(),
          type: "report-attachment",
          text: "Service Report",
          downloadUrl: url,
          filename: e.filename || "fix_report.pdf",
        });
        return;
      }

      // --- Normal ADK event ---
      const adkEvent = evt as AdkEvent;

      // --- turnComplete ---
      if (adkEvent.turnComplete) {
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
          agentStatusIdRef.current = null;
        }
        if (currentMessageIdRef.current) {
          updateMessage(currentMessageIdRef.current, (m) => ({
            ...m,
            isPartial: false,
          }));
        }
        if (currentOutputTransIdRef.current) {
          updateMessage(currentOutputTransIdRef.current, (m) => ({
            ...m,
            isPartial: false,
          }));
        }
        currentMessageIdRef.current = null;
        currentOutputTransIdRef.current = null;
        currentInputTransIdRef.current = null;
        inputTransFinishedRef.current = false;
        hasOutputTransInTurnRef.current = false;
        return;
      }

      // --- interrupted ---
      if (adkEvent.interrupted) {
        audioPlayer.stop();
        if (currentMessageIdRef.current) {
          updateMessage(currentMessageIdRef.current, (m) => ({
            ...m,
            isPartial: false,
            isInterrupted: true,
          }));
        }
        if (currentOutputTransIdRef.current) {
          updateMessage(currentOutputTransIdRef.current, (m) => ({
            ...m,
            isPartial: false,
            isInterrupted: true,
          }));
        }
        currentMessageIdRef.current = null;
        currentOutputTransIdRef.current = null;
        currentInputTransIdRef.current = null;
        inputTransFinishedRef.current = false;
        hasOutputTransInTurnRef.current = false;
        return;
      }

      // --- Input transcription ---
      // NOTE: isSpeaking state is now driven by client-side VAD (useVAD hook),
      // NOT by inputTranscription events. We only use transcription for
      // displaying the user's speech text.
      if (adkEvent.inputTranscription?.text) {
        const txt = adkEvent.inputTranscription.text;
        const finished = adkEvent.inputTranscription.finished;

        const nonLatin = txt.match(
          /[^\u0000-\u007F\u00C0-\u024F\s.,!?'"():\d-]/g,
        );
        if (nonLatin && nonLatin.length / txt.replace(/\s/g, "").length > 0.3) {
          return;
        }

        if (inputTransFinishedRef.current) return;

        if (!currentInputTransIdRef.current) {
          const id = randomId();
          currentInputTransIdRef.current = id;
          addMessage({
            id,
            type: "input-transcription",
            text: cleanCJKSpaces(txt),
            isPartial: !finished,
          });
        } else {
          if (
            !currentOutputTransIdRef.current &&
            !currentMessageIdRef.current
          ) {
            const id = currentInputTransIdRef.current;
            if (finished) {
              updateMessage(id, (m) => ({
                ...m,
                text: cleanCJKSpaces(txt),
                isPartial: false,
              }));
            } else {
              updateMessage(id, (m) => ({
                ...m,
                text: cleanCJKSpaces((m.text || "") + txt),
                isPartial: true,
              }));
            }
          }
        }

        if (finished) {
          currentInputTransIdRef.current = null;
          inputTransFinishedRef.current = true;
        }
        return;
      }

      // --- Output transcription ---
      if (adkEvent.outputTranscription?.text) {
        const txt = adkEvent.outputTranscription.text;
        const finished = adkEvent.outputTranscription.finished;
        hasOutputTransInTurnRef.current = true;

        const nonLatin = txt.match(
          /[^\u0000-\u007F\u00C0-\u024F\s.,!?'"():\d-]/g,
        );
        if (
          nonLatin &&
          txt.replace(/\s/g, "").length > 0 &&
          nonLatin.length / txt.replace(/\s/g, "").length > 0.3
        ) {
          return;
        }

        if (
          currentInputTransIdRef.current &&
          !currentOutputTransIdRef.current
        ) {
          updateMessage(currentInputTransIdRef.current, (m) => ({
            ...m,
            isPartial: false,
          }));
          currentInputTransIdRef.current = null;
          inputTransFinishedRef.current = true;
        }

        if (!currentOutputTransIdRef.current) {
          const id = randomId();
          currentOutputTransIdRef.current = id;
          addMessage({
            id,
            type: "output-transcription",
            text: txt,
            isPartial: !finished,
          });
        } else {
          const id = currentOutputTransIdRef.current;
          if (finished) {
            updateMessage(id, (m) => ({
              ...m,
              text: txt,
              isPartial: false,
            }));
          } else {
            updateMessage(id, (m) => ({
              ...m,
              text: (m.text || "") + txt,
              isPartial: true,
            }));
          }
        }

        if (finished) {
          currentOutputTransIdRef.current = null;
        }
        return;
      }

      // --- Content (text / audio / images) ---
      if (adkEvent.content?.parts) {
        const parts = adkEvent.content.parts;

        if (
          currentInputTransIdRef.current &&
          !currentMessageIdRef.current &&
          !currentOutputTransIdRef.current
        ) {
          updateMessage(currentInputTransIdRef.current, (m) => ({
            ...m,
            isPartial: false,
          }));
          currentInputTransIdRef.current = null;
          inputTransFinishedRef.current = true;
        }

        for (const part of parts) {
          // Audio
          if (part.inlineData) {
            const mime = part.inlineData.mimeType;
            const data = part.inlineData.data;
            if (mime?.startsWith("audio/pcm")) {
              audioPlayer.play(base64ToArray(data));
            } else if (mime?.startsWith("image/")) {
              addMessage({
                id: randomId(),
                type: "agent-image",
                imageUrl: `data:${mime};base64,${data}`,
              });
            }
          }

          // Text
          if (part.text) {
            if (part.thought) continue;
            if (!adkEvent.partial && hasOutputTransInTurnRef.current) continue;

            if (!currentMessageIdRef.current) {
              const id = randomId();
              currentMessageIdRef.current = id;
              addMessage({
                id,
                type: "agent-text",
                text: part.text,
                isPartial: true,
              });
            } else {
              updateMessage(currentMessageIdRef.current, (m) => ({
                ...m,
                text: (m.text || "") + part.text,
                isPartial: true,
              }));
            }
          }
        }
      }
    },
    [addMessage, updateMessage, removeMessage, audioPlayer],
  );

  // ---- WebSocket ----
  const ws = useWebSocket({
    userId,
    sessionId,
    proactivity: false,
    affectiveDialog: false,
    onMessage: handleWsMessage,
    onBinary: () => {},
    onConnected: () => {},
    onDisconnected: () => {},
  });

  // Keep sendJsonRef in sync
  sendJsonRef.current = ws.sendJson;

  // ---- Audio recorder handler ----
  const audioRecorderHandler = useCallback(
    (pcmData: ArrayBuffer) => {
      if (isAudioRef.current && micOn) {
        ws.sendBinary(pcmData);
      }
    },
    [ws, micOn],
  );

  // ---- Helper: start the 1 fps frame streaming interval ----
  const startFrameStreaming = useCallback(() => {
    captureAndSendSnapshot(); // immediate first frame
    if (frameStreamIntervalRef.current)
      clearInterval(frameStreamIntervalRef.current);
    frameStreamIntervalRef.current = setInterval(
      captureAndSendSnapshot,
      1000, // 1 fps — matches ADK recommended max
    );
    console.log("[Session] Started 1 fps background frame streaming");
  }, [captureAndSendSnapshot]);

  // ---- Start session (auto on mount) ----
  const startSession = useCallback(async () => {
    try {
      const videoEl = document.getElementById(
        "cameraPreviewLive",
      ) as HTMLVideoElement;
      if (videoEl) {
        await camera.init(videoEl);
        console.log(
          `[Session] Camera initialized — videoWidth=${videoEl.videoWidth}`,
        );
      } else {
        console.warn("[Session] Camera video element not found in DOM");
      }
      await audioPlayer.init();
      await audioRecorder.init(audioRecorderHandler);

      // Initialize VAD using the same mic stream as the recorder
      const micStream = audioRecorder.getStream();
      if (micStream) {
        await vad.init(micStream);
        console.log(
          "[Session] VAD initialized — audio paused until speech detected",
        );
      }

      isAudioRef.current = true;
      setSessionStarted(true);

      // Start continuous 1 fps frame streaming so the model always has
      // visual context and the frame buffer is warm for tool calls.
      startFrameStreaming();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Session start failed:", error.message);
      // Surface the error so the user knows the camera/mic failed
      addMessage({
        id: randomId(),
        type: "system",
        text: `Failed to initialize session: ${error.message}. Please check camera/microphone permissions and refresh.`,
      });
      // Still mark session as started so user can retry via toggles
      setSessionStarted(true);
    }
  }, [
    camera,
    audioPlayer,
    audioRecorder,
    audioRecorderHandler,
    vad,
    startFrameStreaming,
    addMessage,
  ]);

  // ---- End session ----
  const endSession = useCallback(() => {
    vad.destroy();
    camera.stop();
    audioRecorder.stopMic();
    audioPlayer.stop();
    isAudioRef.current = false;

    if (frameStreamIntervalRef.current) {
      clearInterval(frameStreamIntervalRef.current);
      frameStreamIntervalRef.current = null;
    }

    // Revoke report blob URLs to free memory
    setMessages((prev) => {
      prev.forEach((m) => {
        if (m.downloadUrl) URL.revokeObjectURL(m.downloadUrl);
      });
      return prev;
    });

    navigate("/");
  }, [vad, camera, audioRecorder, audioPlayer, navigate]);

  // ---- Auto-start session on mount ----
  const sessionInitRef = useRef(false);
  useEffect(() => {
    if (sessionInitRef.current) return;
    sessionInitRef.current = true;

    // Wait for the video element to appear in the DOM before starting,
    // with a fallback timeout so the session still starts if the element
    // takes longer than expected (e.g. slower production loads).
    let cancelled = false;
    const tryStart = () => {
      if (cancelled) return;
      const videoEl = document.getElementById("cameraPreviewLive");
      if (videoEl) {
        startSession();
      } else {
        // Retry with requestAnimationFrame to wait for the next paint
        requestAnimationFrame(tryStart);
      }
    };
    // Kick off after a micro-delay so React has committed the DOM
    requestAnimationFrame(tryStart);
    // Safety fallback — start anyway after 2 s even if video not found
    const fallback = setTimeout(() => {
      if (!cancelled) {
        console.warn("[Session] Fallback: starting session without waiting for video element");
        startSession();
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Toggle handlers ----
  const handleToggleCamera = useCallback(() => {
    if (cameraOn) {
      camera.stop();
      setCameraOn(false);
      setPreviewVisible(false);
      // Stop any active burst frame streaming
      if (frameStreamIntervalRef.current) {
        clearInterval(frameStreamIntervalRef.current);
        frameStreamIntervalRef.current = null;
      }
    } else {
      const videoEl = document.getElementById(
        "cameraPreviewLive",
      ) as HTMLVideoElement;
      if (videoEl) {
        camera.init(videoEl).then(() => {
          setCameraOn(true);
          setPreviewVisible(true);
          // Restart the 1 fps frame streaming interval so the model
          // continues to receive visual context after re-enabling.
          startFrameStreaming();
        });
      }
    }
  }, [cameraOn, camera, startFrameStreaming]);

  const handleToggleMic = useCallback(() => {
    setMicOn((prev) => !prev);
  }, []);

  const handleTogglePreview = useCallback(() => {
    setPreviewVisible((prev) => !prev);
  }, []);

  const handleSwitchCamera = useCallback(() => {
    camera.switchCamera();
  }, [camera]);

  // ---- Derive response state from messages ----
  const responseState: ResponseState = (() => {
    if (!sessionStarted) {
      return { mode: "idle" };
    }

    // Check for images or attachments in current turn
    let latestImage = null;
    let latestAttachment = null;
    let latestText = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // Stop looking at previous turns if we hit a completed input transcription
      if (msg.type === "input-transcription") {
        if (msg.isPartial) return { mode: "listening" };
        break;
      }

      if (!latestImage && msg.type === "agent-image" && msg.imageUrl)
        latestImage = msg;
      if (
        !latestAttachment &&
        msg.type === "report-attachment" &&
        msg.downloadUrl
      )
        latestAttachment = msg;
      if (
        !latestText &&
        (msg.type === "agent-text" || msg.type === "output-transcription") &&
        msg.text
      )
        latestText = msg;
    }

    if (latestImage) return { mode: "image", imageUrl: latestImage.imageUrl };
    if (latestAttachment)
      return {
        mode: "attachment",
        text: latestAttachment.text,
        downloadUrl: latestAttachment.downloadUrl,
        filename: latestAttachment.filename,
      };
    if (latestText)
      return {
        mode: "text",
        text: latestText.text,
        isPartial: latestText.isPartial,
      };

    // If user is speaking (VAD detected), show listening
    if (isSpeaking) {
      return { mode: "listening" };
    }

    return { mode: "idle" };
  })();

  // Override: if user is currently speaking, always show listening
  // regardless of previous response mode (stale agent messages, etc.)
  const finalResponse: ResponseState = isSpeaking
    ? { mode: "listening" }
    : responseState;

  // Log response state changes for debugging
  useEffect(() => {
    console.log(
      `[STATE] mode=${finalResponse.mode} isSpeaking=${isSpeaking} msgs=${messages.length}`,
      finalResponse.mode === "text"
        ? `text=${(finalResponse.text ?? "").slice(0, 60)}...`
        : "",
      "",
    );
  }, [
    finalResponse.mode,
    finalResponse.text,
    isSpeaking,
    messages.length,
  ]);

  const showCameraPreview = cameraOn && previewVisible;

  // ---- Show connecting screen until WebSocket is ready ----
  if (!ws.connected) {
    return (
      <Box
        sx={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
          gap: 3,
        }}
      >
        <CircularProgress size={48} />
        <Typography variant="body1" color="text.secondary">
          Connecting to session...
        </Typography>
      </Box>
    );
  }

  return (
    /* Centering wrapper */
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        width: "100%",
        p: { xs: 0, sm: "16px", lg: 0 },
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* Inner phone frame */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: { xs: "100%", sm: 393, lg: "none" },
          height: { xs: "100%", sm: 852, lg: "100%" },
          maxHeight: { xs: "100%", sm: 852, lg: "100%" },
          borderRadius: { xs: 0, sm: "24px", lg: 0 },
          bgcolor: "background.paper", /* #0d0d0d */
          p: { xs: "14px", lg: "32px 20px" },
          gap: "10px",
          overflow: "hidden",
          position: "relative",
          boxSizing: "border-box",
          touchAction: "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {/* ── TOP BAR ── */}
        <SessionTopBar
          connected={ws.connected}
          chatOpen={chatOpen}
          onBack={() => setConfirmOpen(true)}
          onToggleChat={() => setChatOpen((p) => !p)}
        />

        {/* ── MAIN AREA ── */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", lg: "row" },
            flex: 1,
            minHeight: 0,
            gap: showCameraPreview ? { xs: "10px", lg: "20px" } : 0,
            transition: "gap 0.4s ease",
          }}
        >
          {/* Orb area */}
          <ResponsePreview response={finalResponse} />

          {/* Camera preview */}
          <CameraPreview visible={showCameraPreview} />
        </Box>

        {/* ── BOTTOM BAR ── */}
        <SessionBottomBar
          cameraOn={cameraOn}
          micOn={micOn}
          previewVisible={previewVisible}
          onEndSession={endSession}
          onToggleCamera={handleToggleCamera}
          onToggleMic={handleToggleMic}
          onTogglePreview={handleTogglePreview}
          onSwitchCamera={handleSwitchCamera}
        />

        {/* ── CHAT PANEL (overlay) ── */}
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />

        {/* Confirm exit dialog */}
        <ConfirmDialog
          open={confirmOpen}
          title="End Session?"
          message="Are you sure you want to end this session? Your conversation will not be saved."
          confirmLabel="End Session"
          cancelLabel="Stay"
          confirmColor="error"
          onConfirm={() => {
            setConfirmOpen(false);
            endSession();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </Box>
    </Box>
  );
}
