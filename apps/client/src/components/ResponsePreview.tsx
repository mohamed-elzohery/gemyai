import { useState, useEffect, useRef } from "react";
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
  downloadUrl?: string;
  filename?: string;
}

interface ResponsePreviewProps {
  response: ResponseState;
}

// ---------------------------------------------------------------------------
// Extract the last N words that fit a single visible line
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
  // ---------------------------------------------------------------------------
  const orbAgentState: AgentState =
    response.mode === "listening"
      ? "listening"
      : response.mode === "text" && response.isPartial
        ? "talking"
        : null;

  const orbColors: [string, string] =
    response.mode === "listening"
      ? ["#a78bfa", "#7B6FFF"]
      : response.mode === "text" && response.isPartial
        ? ["#60d394", "#34d399"]
        : ["#90CAF9", "#42A5F5"];

  // Status label
  const statusLabel =
    response.mode === "listening"
      ? "Listening"
      : response.mode === "text" && response.isPartial
        ? "Talking"
        : "Idle";

  // Whether to show the orb (idle, listening, text all show orb)
  const showOrb =
    response.mode === "idle" ||
    response.mode === "listening" ||
    response.mode === "text";

  // ---------------------------------------------------------------------------
  // Single-line incremental text: show the latest words that fit one line,
  // cycling from the beginning when a sentence completes.
  // ---------------------------------------------------------------------------
  const rawText = response.mode === "text" ? (response.text ?? "") : "";
  const maxWords = isDesktop ? 8 : 5;

  // Track the previous completed text so we can detect when a new sentence
  // starts streaming and reset.
  const prevTextRef = useRef("");
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (!rawText) {
      setDisplayText("");
      prevTextRef.current = "";
      return;
    }

    // When partial is false the full sentence is done — keep showing it.
    // When partial becomes true again with shorter text, a new turn started.
    if (rawText.length < prevTextRef.current.length) {
      // New sentence detected — reset
      prevTextRef.current = "";
    }
    prevTextRef.current = rawText;

    setDisplayText(lastNWords(rawText, maxWords));
  }, [rawText, maxWords]);

  return (
    <Box
      sx={{
        flex: { xs: "2 1 0", lg: 1 },
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

        {/* Streaming text — single line, latest words */}
        {showOrb && displayText && (
          <Box
            sx={{
              width: "100%",
              px: "20px",
              textAlign: "center",
              flexShrink: 0,
              overflow: "hidden",
              height: 32,
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
                whiteSpace: "nowrap",
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
