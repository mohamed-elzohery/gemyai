import { useState, useCallback, useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import type {
  ChatMessage,
  ConsoleEntry,
  AdkEvent,
  AgentStatusEvent,
  GroundingStatusEvent,
  GroundingResultEvent,
} from "./types";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { useCamera } from "./hooks/useCamera";
import { useVAD } from "./hooks/useVAD";
import { base64ToArray } from "./utils/audio";
import {
  cleanCJKSpaces,
  sanitizeEventForDisplay,
  formatTimestamp,
  randomId,
} from "./utils/textHelpers";
import Header from "./components/Header";
import ChatPanel from "./components/ChatPanel";
import EventConsole from "./components/EventConsole";
import CameraPreview from "./components/CameraPreview";

const userId = "demo-user";
const sessionId = "demo-session-" + Math.random().toString(36).substring(7);

const TOOL_EMOJIS: Record<string, string> = {
  diagnose_problem: "\u{1F50D}",
  create_fix_plan: "\u{1F4CB}",
  replan_fix: "\u{1F504}",
  get_current_step: "\u{1F4CD}",
  report_step_result: "\u{2705}",
  annotate_image: "\u{1F3AF}",
};

export default function App() {
  // ---- RunConfig toggles ----
  const [proactivity, setProactivity] = useState(false);
  const [affectiveDialog, setAffectiveDialog] = useState(false);

  // ---- Chat & console state ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [showAudioEvents, setShowAudioEvents] = useState(false);

  // ---- Session state ----
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const isAudioRef = useRef(false);

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

  // ---- Console helper ----
  const addConsole = useCallback(
    (
      type: ConsoleEntry["type"],
      content: string,
      data?: unknown,
      emoji?: string,
      author?: string,
      isAudio?: boolean,
    ) => {
      setConsoleEntries((prev) => [
        ...prev,
        {
          id: randomId(),
          type,
          content,
          data,
          emoji,
          author,
          isAudio,
          timestamp: formatTimestamp(),
        },
      ]);
    },
    [],
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

  const addSystem = useCallback(
    (text: string) => {
      addMessage({ id: randomId(), type: "system", text });
    },
    [addMessage],
  );

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
    addConsole("outgoing", "Snapshot sent", undefined, "📷", "user");
  }, [camera, addConsole]);

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

    addConsole(
      "outgoing",
      "Speech start → activity_start",
      undefined,
      "🎙️",
      "user",
    );
  }, [captureAndSendSnapshot, addConsole]);

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

      addConsole(
        "outgoing",
        "Speech end → activity_end",
        undefined,
        "🎙️",
        "user",
      );
    },
    [captureAndSendSnapshot, addConsole],
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
        // Remove previous status bubble
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
        }
        const id = randomId();
        agentStatusIdRef.current = id;
        const emoji = TOOL_EMOJIS[e.tool] || "\u{2699}\u{FE0F}";
        addMessage({
          id,
          type: "agent-status",
          text: `${emoji} ${e.message}`,
        });
        addConsole("incoming", e.message, e, emoji, "system");
        return;
      }

      // --- Grounding loading ---
      if (evt.type === "grounding_status") {
        const e = evt as unknown as GroundingStatusEvent;
        const id = randomId();
        groundingLoadingIdRef.current = id;
        addMessage({
          id,
          type: "grounding-loading",
          text: `🔍 ${e.message}`,
        });
        addConsole("incoming", e.message, e, "🔍", "system");
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
        addConsole(
          "incoming",
          "Visual grounding result image",
          { mimeType: e.mimeType, imageSize: e.image.length },
          "🖼️",
          "system",
        );
        return;
      }

      // --- Normal ADK event ---
      const adkEvent = evt as AdkEvent;
      const author = adkEvent.author || "system";

      // Build console summary
      let eventSummary = "Event";
      let eventEmoji = "📨";
      let isAudioEvent = false;

      if (adkEvent.turnComplete) {
        eventSummary = "Turn Complete";
        eventEmoji = "✅";
      } else if (adkEvent.interrupted) {
        eventSummary = "Interrupted";
        eventEmoji = "⏸️";
      } else if (adkEvent.inputTranscription) {
        const t = adkEvent.inputTranscription.text || "";
        const trunc = t.length > 60 ? t.substring(0, 60) + "..." : t;
        eventSummary = `Input Transcription: "${trunc}"`;
        eventEmoji = "📝";
      } else if (adkEvent.outputTranscription) {
        const t = adkEvent.outputTranscription.text || "";
        const trunc = t.length > 60 ? t.substring(0, 60) + "..." : t;
        eventSummary = `Output Transcription: "${trunc}"`;
        eventEmoji = "📝";
      } else if (adkEvent.usageMetadata) {
        const u = adkEvent.usageMetadata;
        const p = u.promptTokenCount || 0;
        const r = u.candidatesTokenCount || 0;
        const total = u.totalTokenCount || 0;
        eventSummary = `Token Usage: ${total.toLocaleString()} total (${p.toLocaleString()} prompt + ${r.toLocaleString()} response)`;
        eventEmoji = "📊";
      } else if (adkEvent.content?.parts) {
        const parts = adkEvent.content.parts;
        const hasText = parts.some((p) => p.text);
        const hasAudio = parts.some((p) => p.inlineData);
        const hasCode = parts.some((p) => p.executableCode);
        const hasCodeResult = parts.some((p) => p.codeExecutionResult);

        if (hasCode) {
          const cp = parts.find((p) => p.executableCode);
          if (cp?.executableCode) {
            const code = cp.executableCode.code || "";
            const lang = cp.executableCode.language || "unknown";
            const trunc =
              code.length > 60
                ? code.substring(0, 60).replace(/\n/g, " ") + "..."
                : code.replace(/\n/g, " ");
            eventSummary = `Executable Code (${lang}): ${trunc}`;
            eventEmoji = "💻";
          }
        }
        if (hasCodeResult) {
          const rp = parts.find((p) => p.codeExecutionResult);
          if (rp?.codeExecutionResult) {
            const outcome = rp.codeExecutionResult.outcome || "UNKNOWN";
            const output = rp.codeExecutionResult.output || "";
            const trunc =
              output.length > 60
                ? output.substring(0, 60).replace(/\n/g, " ") + "..."
                : output.replace(/\n/g, " ");
            eventSummary = `Code Execution Result (${outcome}): ${trunc}`;
            eventEmoji = outcome === "OUTCOME_OK" ? "✅" : "❌";
          }
        }
        if (hasText) {
          const tp = parts.find((p) => p.text);
          if (tp?.text) {
            const trunc =
              tp.text.length > 80 ? tp.text.substring(0, 80) + "..." : tp.text;
            eventSummary = `Text: "${trunc}"`;
            eventEmoji = "💭";
          }
        }
        if (hasAudio) {
          const ap = parts.find((p) => p.inlineData);
          if (ap?.inlineData) {
            const dataLen = ap.inlineData.data?.length || 0;
            const byteSize = Math.floor(dataLen * 0.75);
            eventSummary = `Audio Response: ${ap.inlineData.mimeType} (${byteSize.toLocaleString()} bytes)`;
            eventEmoji = "🔊";
          }
          isAudioEvent = true;

          // Log audio event
          const sanitized = sanitizeEventForDisplay(adkEvent);
          addConsole(
            "incoming",
            eventSummary,
            sanitized,
            eventEmoji,
            author,
            true,
          );
        }
      }

      // Log non-audio events
      const isAudioOnly =
        adkEvent.content?.parts?.some((p) => p.inlineData) &&
        !adkEvent.content?.parts?.some((p) => p.text);
      if (!isAudioOnly) {
        const sanitized = sanitizeEventForDisplay(adkEvent);
        addConsole("incoming", eventSummary, sanitized, eventEmoji, author);
      }

      // --- turnComplete ---
      if (adkEvent.turnComplete) {
        if (agentStatusIdRef.current) {
          removeMessage(agentStatusIdRef.current);
          agentStatusIdRef.current = null;
        }
        // Finalize partial messages
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

        // Filter non-English
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

        // Filter non-English
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

        // Finalize input transcription on first output
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

        // Finalize input transcription on first content
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
    [addMessage, updateMessage, removeMessage, addConsole, audioPlayer],
  );

  // ---- WebSocket ----
  const ws = useWebSocket({
    userId,
    sessionId,
    proactivity,
    affectiveDialog,
    onMessage: handleWsMessage,
    onBinary: () => {},
    onConnected: () => {
      addSystem("Connected to ADK streaming server");
      addConsole(
        "incoming",
        "WebSocket Connected",
        { userId, sessionId },
        "🔌",
        "system",
      );
    },
    onDisconnected: () => {
      addSystem("Connection closed. Reconnecting in 5 seconds...");
      addConsole(
        "error",
        "WebSocket Disconnected",
        { reconnecting: true },
        "🔌",
        "system",
      );
    },
  });

  // Keep sendJsonRef in sync
  sendJsonRef.current = ws.sendJson;

  // ---- Audio recorder handler (VAD-gated) ----
  const audioRecorderHandler = useCallback(
    (pcmData: ArrayBuffer) => {
      if (isAudioRef.current && isSpeakingRef.current) {
        ws.sendBinary(pcmData);
      }
    },
    [ws],
  );

  // ---- Send text message ----
  const handleSendText = useCallback(
    (text: string) => {
      addMessage({ id: randomId(), type: "user-text", text });
      ws.sendJson({ type: "text", text });
      addConsole("outgoing", "User Message: " + text, undefined, "💬", "user");
    },
    [ws, addMessage, addConsole],
  );

  // ---- Start session ----
  const handleStartSession = useCallback(async () => {
    try {
      const videoEl = document.getElementById(
        "cameraPreviewLive",
      ) as HTMLVideoElement;
      await camera.init(videoEl);
      await audioPlayer.init();
      await audioRecorder.init(audioRecorderHandler);
      await vadHook.init();

      isAudioRef.current = true;
      setSessionStarted(true);
      addSystem("Session started — speak to interact with the agent");
      addConsole(
        "outgoing",
        "Session started (audio + camera + VAD)",
        { status: "active", camera: true, vad: "client-side" },
        "🚀",
        "system",
      );
    } catch (err: unknown) {
      const error = err as Error;
      let errorMsg = `Failed to start session: ${error.message}`;
      if (error.name === "NotAllowedError") {
        errorMsg =
          "Camera/microphone permission denied. Please allow access and try again.";
      } else if (error.name === "NotFoundError") {
        errorMsg = "No camera or microphone found on this device.";
      }
      addSystem(errorMsg);
      addConsole(
        "error",
        "Session start failed",
        { error: error.message },
        "⚠️",
        "system",
      );
      camera.stop();
    }
  }, [
    camera,
    audioPlayer,
    audioRecorder,
    audioRecorderHandler,
    vadHook,
    addSystem,
    addConsole,
  ]);

  // ---- Setting change → reconnect ----
  const handleProactivityChange = useCallback(
    (checked: boolean) => {
      setProactivity(checked);
      addSystem("Reconnecting with updated settings...");
      addConsole(
        "outgoing",
        "Reconnecting due to settings change",
        { proactivity: checked, affective_dialog: affectiveDialog },
        "🔄",
        "system",
      );
    },
    [affectiveDialog, addSystem, addConsole],
  );

  const handleAffectiveChange = useCallback(
    (checked: boolean) => {
      setAffectiveDialog(checked);
      addSystem("Reconnecting with updated settings...");
      addConsole(
        "outgoing",
        "Reconnecting due to settings change",
        { proactivity, affective_dialog: checked },
        "🔄",
        "system",
      );
    },
    [proactivity, addSystem, addConsole],
  );

  const clearConsole = useCallback(() => setConsoleEntries([]), []);

  // Memoize filtered console entries
  const visibleConsoleEntries = useMemo(
    () =>
      showAudioEvents
        ? consoleEntries
        : consoleEntries.filter((e) => !e.isAudio),
    [consoleEntries, showAudioEvents],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header
        connected={ws.connected}
        proactivity={proactivity}
        affectiveDialog={affectiveDialog}
        onProactivityChange={handleProactivityChange}
        onAffectiveDialogChange={handleAffectiveChange}
      />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          maxWidth: 1800,
          width: "100%",
          mx: "auto",
        }}
      >
        {/* Chat area */}
        <Box
          sx={{
            flex: 2,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRight: 1,
            borderColor: "divider",
            position: "relative",
          }}
        >
          <ChatPanel
            messages={messages}
            onSendText={handleSendText}
            onStartSession={handleStartSession}
            sessionStarted={sessionStarted}
            sendEnabled={ws.connected}
          />
          <CameraPreview visible={sessionStarted} speaking={isSpeaking} />
        </Box>

        {/* Event console */}
        <EventConsole
          entries={visibleConsoleEntries}
          showAudioEvents={showAudioEvents}
          onShowAudioEventsChange={setShowAudioEvents}
          onClear={clearConsole}
        />
      </Box>
    </Box>
  );
}
