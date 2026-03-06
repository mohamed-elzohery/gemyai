import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type {
  ChatMessage,
  AdkEvent,
  AgentStatusEvent,
  GroundingResultEvent,
} from "../types";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useCamera } from "../hooks/useCamera";
import { useVAD } from "../hooks/useVAD";
import { base64ToArray } from "../utils/audio";
import { cleanCJKSpaces, randomId } from "../utils/textHelpers";

import SessionTopBar from "../components/SessionTopBar";
import SessionBottomBar from "../components/SessionBottomBar";
import ResponsePreview from "../components/ResponsePreview";
import type { ResponseState } from "../components/ResponsePreview";
import CameraPreview from "../components/CameraPreview";
import ConfirmDialog from "../components/ConfirmDialog";

const userId = "demo-user";

export default function SessionPage() {
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

  // ---- Image streaming ----
  const imageStreamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const speechSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const MAX_SPEECH_DURATION_MS = 60000;

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

  // ---- Snapshot capture & send ----
  const sendJsonRef = useRef<(data: unknown) => void>(() => {});

  const captureAndSendSnapshot = useCallback(() => {
    if (!isSpeakingRef.current) return;
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
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    sendJsonRef.current({ type: "activity_start" });

    // Capture first snapshot immediately
    captureAndSendSnapshot();

    // Periodic snapshots every 1s
    if (imageStreamIntervalRef.current)
      clearInterval(imageStreamIntervalRef.current);
    imageStreamIntervalRef.current = setInterval(captureAndSendSnapshot, 1000);

    // Safety timeout
    if (speechSafetyTimeoutRef.current)
      clearTimeout(speechSafetyTimeoutRef.current);
    speechSafetyTimeoutRef.current = setTimeout(() => {
      if (imageStreamIntervalRef.current) {
        clearInterval(imageStreamIntervalRef.current);
        imageStreamIntervalRef.current = null;
      }
    }, MAX_SPEECH_DURATION_MS);
  }, [captureAndSendSnapshot]);

  const handleSpeechEnd = useCallback(
    (_audio: Float32Array) => {
      if (imageStreamIntervalRef.current) {
        clearInterval(imageStreamIntervalRef.current);
        imageStreamIntervalRef.current = null;
      }
      if (speechSafetyTimeoutRef.current) {
        clearTimeout(speechSafetyTimeoutRef.current);
        speechSafetyTimeoutRef.current = null;
      }

      // Final snapshot while still speaking
      captureAndSendSnapshot();

      isSpeakingRef.current = false;
      setIsSpeaking(false);

      sendJsonRef.current({ type: "activity_end" });
    },
    [captureAndSendSnapshot],
  );

  const vadHook = useVAD({
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
  });

  // ---- WebSocket message handler ----
  const handleWsMessage = useCallback(
    (parsed: unknown) => {
      const evt = parsed as Record<string, unknown>;

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
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Session start failed:", error.message);
      // Still mark session as started so user can retry
    }
  }, [camera, audioPlayer, audioRecorder, audioRecorderHandler, vadHook]);

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
    } else {
      const videoEl = document.getElementById(
        "cameraPreviewLive",
      ) as HTMLVideoElement;
      if (videoEl) {
        camera.init(videoEl).then(() => {
          setCameraOn(true);
          setPreviewVisible(true);
        });
      }
    }
  }, [cameraOn, camera]);

  const handleToggleMic = useCallback(() => {
    setMicOn((prev) => !prev);
  }, []);

  const handleTogglePreview = useCallback(() => {
    setPreviewVisible((prev) => !prev);
  }, []);

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

      // Agent status → show status
      if (msg.type === "agent-status") {
        return { mode: "status", statusText: msg.text };
      }

      // Grounding loading → show status
      if (msg.type === "grounding-loading") {
        return { mode: "status", statusText: msg.text };
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
  const finalResponse: ResponseState =
    isSpeaking && responseState.mode === "idle"
      ? { mode: "listening" }
      : responseState;

  const showCameraPreview = cameraOn && previewVisible;

  return (
    <Box
      onPointerDown={handleScreenTap}
      sx={{
        height: "100dvh",
        width: "100%",
        display: "grid",
        gridTemplateRows: showCameraPreview ? "7fr 3fr" : "1fr",
        transition: "grid-template-rows 0.3s ease",
        bgcolor: "background.default",
        overflow: "hidden",
        position: "relative",
        // Touch action for native gestures
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        // Desktop layout
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
        }}
      >
        <ResponsePreview response={finalResponse} />
      </Box>

      {/* Camera Preview Area */}
      <CameraPreview visible={showCameraPreview} />

      {/* Top bar */}
      <SessionTopBar
        visible={barsVisible}
        connected={ws.connected}
        onBack={() => setConfirmOpen(true)}
      />

      {/* Bottom bar */}
      <SessionBottomBar
        visible={barsVisible}
        cameraOn={cameraOn}
        micOn={micOn}
        previewVisible={previewVisible}
        onEndSession={endSession}
        onToggleCamera={handleToggleCamera}
        onToggleMic={handleToggleMic}
        onTogglePreview={handleTogglePreview}
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
