import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
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
import ConfirmDialog from "../components/ConfirmDialog";

export default function SessionPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";
  const { id: sessionId = "default" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  // ---- Session state ----
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const isAudioRef = useRef(false);

  // ---- Controls state ----
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [previewVisible, setPreviewVisible] = useState(true);

  // ---- Bar visibility (mobile auto-hide) ----
  const [barsVisible, setBarsVisible] = useState(true);
  const barsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Confirm dialog ----
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  // ---- Image streaming (continuous 1fps) ----
  const imageStreamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

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

  // ---- Snapshot capture & send (continuous 1fps, independent of speech) ----
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

  // ---- VAD callbacks ----
  const handleSpeechStart = useCallback(() => {
    console.log("[VAD] Speech START — interrupting agent audio");
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    // Immediately stop agent audio playback so the user can speak
    audioPlayer.stop();

    // Resume audio stream so PCM data flows to the server
    audioRecorder.resume();

    sendJsonRef.current({ type: "activity_start" });
  }, [audioRecorder, audioPlayer]);

  const handleSpeechEnd = useCallback(
    (_audio: Float32Array) => {
      console.log("[VAD] Speech END");
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Pause audio stream so no PCM data flows while user is silent
      audioRecorder.pause();

      sendJsonRef.current({ type: "activity_end" });
    },
    [audioRecorder],
  );

  const vadHook = useVAD({
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
  });

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

  // ---- Audio recorder handler (VAD-gated) ----
  const audioRecorderHandler = useCallback(
    (pcmData: ArrayBuffer) => {
      if (isAudioRef.current && isSpeakingRef.current && micOn) {
        ws.sendBinary(pcmData);
      }
    },
    [ws, micOn],
  );

  // ---- Start session (auto on mount) ----
  const startSession = useCallback(async () => {
    try {
      const videoEl = document.getElementById(
        "cameraPreviewLive",
      ) as HTMLVideoElement;
      if (videoEl) await camera.init(videoEl);
      await audioPlayer.init();
      await audioRecorder.init(audioRecorderHandler);
      await vadHook.init();

      isAudioRef.current = true;
      setSessionStarted(true);

      // Start continuous 1fps camera frame streaming to the server
      if (imageStreamIntervalRef.current)
        clearInterval(imageStreamIntervalRef.current);
      imageStreamIntervalRef.current = setInterval(
        captureAndSendSnapshot,
        1000,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Session start failed:", error.message);
      // Still mark session as started so user can retry
    }
  }, [
    camera,
    audioPlayer,
    audioRecorder,
    audioRecorderHandler,
    vadHook,
    captureAndSendSnapshot,
  ]);

  // ---- End session ----
  const endSession = useCallback(() => {
    camera.stop();
    audioRecorder.stopMic();
    vadHook.destroy();
    audioPlayer.stop();
    isAudioRef.current = false;

    if (imageStreamIntervalRef.current) {
      clearInterval(imageStreamIntervalRef.current);
      imageStreamIntervalRef.current = null;
    }

    // Revoke report blob URLs to free memory
    setMessages((prev) => {
      prev.forEach((m) => {
        if (m.downloadUrl) URL.revokeObjectURL(m.downloadUrl);
      });
      return prev;
    });

    navigate("/");
  }, [camera, audioRecorder, vadHook, audioPlayer, navigate]);

  // ---- Auto-start session on mount ----
  const sessionInitRef = useRef(false);
  useEffect(() => {
    if (sessionInitRef.current) return;
    sessionInitRef.current = true;
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      startSession();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Bar auto-hide logic ----
  const resetBarTimer = useCallback(() => {
    if (barsTimerRef.current) clearTimeout(barsTimerRef.current);
    setBarsVisible(true);
    barsTimerRef.current = setTimeout(() => {
      setBarsVisible(false);
    }, 3000);
  }, []);

  // Show bars initially, then auto-hide after 3s
  useEffect(() => {
    resetBarTimer();
    return () => {
      if (barsTimerRef.current) clearTimeout(barsTimerRef.current);
    };
  }, [resetBarTimer]);

  // Tap anywhere to toggle bars
  const handleScreenTap = useCallback(
    (e: React.PointerEvent) => {
      // Don't trigger on buttons or interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("[role='button']") ||
        target.closest("a")
      ) {
        return;
      }
      resetBarTimer();
    },
    [resetBarTimer],
  );

  // ---- Toggle handlers ----
  const handleToggleCamera = useCallback(() => {
    if (cameraOn) {
      camera.stop();
      setCameraOn(false);
      setPreviewVisible(false);
      // Stop frame streaming while camera is off
      if (imageStreamIntervalRef.current) {
        clearInterval(imageStreamIntervalRef.current);
        imageStreamIntervalRef.current = null;
      }
    } else {
      const videoEl = document.getElementById(
        "cameraPreviewLive",
      ) as HTMLVideoElement;
      if (videoEl) {
        camera.init(videoEl).then(() => {
          setCameraOn(true);
          setPreviewVisible(true);
          // Restart continuous 1fps frame streaming
          if (imageStreamIntervalRef.current)
            clearInterval(imageStreamIntervalRef.current);
          imageStreamIntervalRef.current = setInterval(
            captureAndSendSnapshot,
            1000,
          );
        });
      }
    }
  }, [cameraOn, camera, captureAndSendSnapshot]);

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

    // Find the latest relevant message (from the end)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // Agent image → show image
      if (msg.type === "agent-image" && msg.imageUrl) {
        return { mode: "image", imageUrl: msg.imageUrl };
      }

      // Report attachment → show download card
      if (msg.type === "report-attachment" && msg.downloadUrl) {
        return {
          mode: "attachment",
          text: msg.text,
          downloadUrl: msg.downloadUrl,
          filename: msg.filename,
        };
      }

      // Agent status → show thinking
      if (msg.type === "agent-status") {
        return { mode: "thinking", statusText: msg.text };
      }

      // Grounding loading → show thinking
      if (msg.type === "grounding-loading") {
        return { mode: "thinking", statusText: msg.text };
      }

      // Agent text → show text streaming
      if (msg.type === "agent-text" && msg.text) {
        return { mode: "text", text: msg.text, isPartial: msg.isPartial };
      }

      // Output transcription → show text
      if (msg.type === "output-transcription" && msg.text) {
        return { mode: "text", text: msg.text, isPartial: msg.isPartial };
      }

      // Input transcription → show listening (user is talking)
      if (msg.type === "input-transcription" && msg.isPartial) {
        return { mode: "listening" };
      }
    }

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
      finalResponse.mode === "thinking"
        ? `status=${finalResponse.statusText}`
        : "",
    );
  }, [
    finalResponse.mode,
    finalResponse.text,
    finalResponse.statusText,
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
    <Box
      onPointerDown={handleScreenTap}
      sx={{
        height: "100dvh",
        width: "100%",
        display: "grid",
        gridTemplateRows: showCameraPreview ? "7fr 3fr" : "1fr",
        gap: { xs: 0.75, md: 1 },
        p: { xs: 0.75, md: 1.5 },
        bgcolor: "background.default",
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        [theme.breakpoints.up("md")]: {
          gridTemplateRows: "1fr",
          gridTemplateColumns: showCameraPreview ? "7fr 3fr" : "1fr",
        },
      }}
    >
      {/* Response Preview Area */}
      <Box
        sx={{
          overflow: "hidden",
          position: "relative",
          minHeight: 0,
          borderRadius: 3,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <ResponsePreview response={finalResponse} />
      </Box>

      {/* Camera Preview Area */}
      <CameraPreview visible={showCameraPreview} />

      {/* Top bar (fixed overlay) */}
      <SessionTopBar
        visible={barsVisible}
        connected={ws.connected}
        onBack={() => setConfirmOpen(true)}
      />

      {/* Bottom bar (fixed overlay) */}
      <SessionBottomBar
        visible={barsVisible}
        cameraOn={cameraOn}
        micOn={micOn}
        previewVisible={previewVisible}
        onEndSession={endSession}
        onToggleCamera={handleToggleCamera}
        onToggleMic={handleToggleMic}
        onTogglePreview={handleTogglePreview}
        onSwitchCamera={handleSwitchCamera}
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
  );
}
