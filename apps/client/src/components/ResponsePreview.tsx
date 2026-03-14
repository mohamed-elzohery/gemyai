import { useState, useEffect, useRef, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Orb from "./Orb";
import type { AgentState } from "./Orb";
import ImageViewerModal from "./ImageViewerModal";

export interface ResponseState {
  mode: "idle" | "listening" | "text" | "image" | "attachment";
  text?: string;
  imageUrl?: string;
  statusText?: string;
  isPartial?: boolean;
  /** True when the audio worklet is actively playing back audio. */
  isAudioPlaying?: boolean;
  downloadUrl?: string;
  filename?: string;
}

interface ResponsePreviewProps {
  response: ResponseState;
}

// ---------------------------------------------------------------------------
// Extract the last N words that fit the visible area (2 lines)
// ---------------------------------------------------------------------------
function lastNWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(-maxWords).join(" ");
}

export default function ResponsePreview({ response }: ResponsePreviewProps) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  // ---------------------------------------------------------------------------
  // Map mode → Orb AgentState (idle, listening, talking)
  // Use isAudioPlaying (actual speaker output) rather than isPartial
  // (WS streaming) so the orb reacts to real playback, not buffered chunks.
  // ---------------------------------------------------------------------------
  const isTalking = response.mode === "text" && !!response.isAudioPlaying;

  const orbAgentState: AgentState =
    response.mode === "listening" ? "listening" : isTalking ? "talking" : null;

  const orbColors: [string, string] =
    response.mode === "listening"
      ? ["#a78bfa", "#7B6FFF"]
      : isTalking
        ? ["#60d394", "#34d399"]
        : ["#90CAF9", "#42A5F5"];

  // Status label
  const statusLabel =
    response.mode === "listening"
      ? "Listening"
      : isTalking
        ? "Talking"
        : "Idle";

  // Whether to show the orb (idle, listening, text all show orb)
  const showOrb =
    response.mode === "idle" ||
    response.mode === "listening" ||
    response.mode === "text";

  // ---------------------------------------------------------------------------
  // Two-line incremental text synced with actual audio playback.
  //
  // Words are queued as they arrive from outputTranscription. A reveal
  // timer pops words from the queue ONLY while audio is actually playing
  // through the speaker (isAudioPlaying). When the turn finishes
  // (isPartial=false), any remaining queued words are flushed immediately.
  // ---------------------------------------------------------------------------
  const rawText = response.mode === "text" ? (response.text ?? "") : "";
  const maxWords = isDesktop ? 14 : 10;
  const isPlaying = response.mode === "text" && !!response.isAudioPlaying;

  // Word queue and reveal state
  const wordQueueRef = useRef<string[]>([]);
  const revealedWordsRef = useRef<string[]>([]);
  const prevRawLenRef = useRef(0);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [displayText, setDisplayText] = useState("");

  // Push new words into the queue as rawText grows
  useEffect(() => {
    if (!rawText) {
      wordQueueRef.current = [];
      revealedWordsRef.current = [];
      prevRawLenRef.current = 0;
      setDisplayText("");
      return;
    }

    // Detect new turn (text got shorter)
    if (rawText.length < prevRawLenRef.current) {
      wordQueueRef.current = [];
      revealedWordsRef.current = [];
    }

    const allWords = rawText.split(/\s+/).filter(Boolean);
    const prevWords = prevRawLenRef.current
      ? (response.text ?? "")
          .substring(0, prevRawLenRef.current)
          .split(/\s+/)
          .filter(Boolean)
      : [];

    // Only queue genuinely new words
    const alreadyQueued =
      revealedWordsRef.current.length + wordQueueRef.current.length;
    if (allWords.length > alreadyQueued) {
      const newWords = allWords.slice(alreadyQueued);
      wordQueueRef.current.push(...newWords);
    }

    prevRawLenRef.current = rawText.length;
  }, [rawText]);

  // Flush remaining queue when turn completes
  useEffect(() => {
    if (
      response.mode === "text" &&
      response.isPartial === false &&
      wordQueueRef.current.length > 0
    ) {
      revealedWordsRef.current.push(...wordQueueRef.current);
      wordQueueRef.current = [];
      setDisplayText(lastNWords(revealedWordsRef.current.join(" "), maxWords));
    }
  }, [response.isPartial, response.mode, maxWords]);

  // Reveal timer — pops words only while audio is playing
  const revealWord = useCallback(() => {
    if (wordQueueRef.current.length > 0) {
      const word = wordQueueRef.current.shift()!;
      revealedWordsRef.current.push(word);
      setDisplayText(lastNWords(revealedWordsRef.current.join(" "), maxWords));
    }
  }, [maxWords]);

  useEffect(() => {
    if (isPlaying && wordQueueRef.current.length > 0) {
      // Reveal ~3 words/sec → one word every ~330ms
      revealTimerRef.current = setInterval(revealWord, 330);
    } else if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    return () => {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [isPlaying, revealWord]);

  return (
    <Box
      sx={{
        flex: { xs: "1 1 0", lg: 1 },
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        py: { xs: 0, lg: "16px" },
        bgcolor: "#000",
        borderRadius: "12px",
      }}
    >
      {/* Zone 1: Status label at TOP */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          pt: "16px",
          pb: "8px",
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "#a78bfa",
            animation: "dotPulse 1.5s ease-in-out infinite",
            "@keyframes dotPulse": {
              "0%, 100%": { opacity: 1, transform: "scale(1)" },
              "50%": { opacity: 0.5, transform: "scale(0.75)" },
            },
          }}
        />
        <Typography
          sx={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontWeight: 600,
            color: "#c4b5fd",
          }}
        >
          {statusLabel}
        </Typography>
      </Box>

      {/* Zone 2: Center — Orb+text (gap-based) or Image/Attachment */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: 0,
          gap: "16px",
        }}
      >
        {/* Orb (idle, listening, text modes) */}
        {showOrb && (
          <Box
            sx={{
              position: "relative",
              width: 160,
              height: 160,
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                filter:
                  "drop-shadow(0 0 60px rgba(108,99,255,0.4)) drop-shadow(0 0 120px rgba(108,99,255,0.18))",
              }}
            >
              <Orb agentState={orbAgentState} colors={orbColors} />
            </Box>
          </Box>
        )}

        {/* Streaming text — two lines, synced with audio playback */}
        {showOrb && displayText && (
          <Box
            sx={{
              width: "100%",
              px: "20px",
              textAlign: "center",
              flexShrink: 0,
              overflow: "hidden",
              minHeight: 32,
              maxHeight: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: "1.05rem", md: "1.15rem" },
                fontWeight: 500,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
                /* Blinking cursor */
                "&::after": {
                  content: "'|'",
                  animation: response.isPartial
                    ? "blink 0.8s step-end infinite"
                    : "none",
                  color: "#a78bfa",
                  fontWeight: 300,
                  ml: "2px",
                  display: response.isPartial ? "inline" : "none",
                },
                "@keyframes blink": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0 },
                },
              }}
            >
              {displayText}
            </Typography>
          </Box>
        )}

        {/* Image (annotated) — replaces Orb */}
        {response.mode === "image" && response.imageUrl && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              px: 2,
            }}
          >
            <Box
              component="img"
              src={response.imageUrl}
              alt="Annotated image"
              onClick={() => setImageModalOpen(true)}
              sx={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                cursor: "pointer",
                userSelect: "none",
                WebkitTouchCallout: "none",
                borderRadius: "12px",
                animation: "imageFadeIn 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
                "@keyframes imageFadeIn": {
                  from: { opacity: 0, transform: "scale(0.92)" },
                  to: { opacity: 1, transform: "scale(1)" },
                },
              }}
            />
          </Box>
        )}

        {/* Attachment → Download card — replaces Orb */}
        {response.mode === "attachment" && response.downloadUrl && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              animation: "imageFadeIn 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
              "@keyframes imageFadeIn": {
                from: { opacity: 0, transform: "scale(0.92)" },
                to: { opacity: 1, transform: "scale(1)" },
              },
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: 3,
                bgcolor: "error.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: 3,
              }}
            >
              <Typography
                sx={{ color: "#fff", fontWeight: 800, fontSize: "1.4rem" }}
              >
                PDF
              </Typography>
            </Box>
            <Typography
              sx={{
                color: "#f3f4f6",
                fontWeight: 600,
                fontSize: "1.125rem",
                textAlign: "center",
              }}
            >
              {response.text || "Service Report"}
            </Typography>
            <Typography
              sx={{
                color: "rgba(255,255,255,0.6)",
                textAlign: "center",
                maxWidth: 300,
                fontSize: "1rem",
              }}
            >
              Your report is ready. Tap below to download.
            </Typography>
            <Box
              component="a"
              href={response.downloadUrl}
              download={response.filename || "fix_report.pdf"}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 4,
                py: 1.5,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "#fff",
                fontWeight: 600,
                fontSize: "1rem",
                textDecoration: "none",
                cursor: "pointer",
                transition: "background-color 0.2s",
                "&:hover": { bgcolor: "primary.dark" },
                boxShadow: 2,
              }}
            >
              ↓ Download Report
            </Box>
          </Box>
        )}
      </Box>

      {/* Image modal */}
      {response.mode === "image" && response.imageUrl && (
        <ImageViewerModal
          open={imageModalOpen}
          imageUrl={response.imageUrl}
          onClose={() => setImageModalOpen(false)}
        />
      )}
    </Box>
  );
}
