import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Orb from "./Orb";
import type { AgentState } from "./Orb";
import ImageViewerModal from "./ImageViewerModal";
import { glassCardSx } from "../theme";

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

export default function ResponsePreview({ response }: ResponsePreviewProps) {
  const [imageModalOpen, setImageModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Map mode → Orb AgentState (only idle and listening)
  // ---------------------------------------------------------------------------
  const orbAgentState: AgentState =
    response.mode === "listening" ? "listening" : null;

  const orbColors: [string, string] =
    response.mode === "listening"
      ? ["#a78bfa", "#7B6FFF"]
      : ["#90CAF9", "#42A5F5"];

  // Status label
  const statusLabel = response.mode === "listening" ? "Listening" : "Idle";

  // Whether to show the orb (idle, listening, text all show orb)
  const showOrb =
    response.mode === "idle" ||
    response.mode === "listening" ||
    response.mode === "text";

  // Streaming text line (shown below orb)
  const streamingText = response.mode === "text" ? (response.text ?? "") : "";

  return (
    <Box
      sx={{
        ...glassCardSx,
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        py: { xs: 0, lg: "16px" },
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

      {/* Zone 2: Center — Orb or Image/Attachment */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: 0,
        }}
      >
        {/* Orb (idle, listening, text modes) */}
        {showOrb && (
          <Box sx={{ position: "relative", width: 160, height: 160 }}>
            {/* Pulsing rings */}
            {[
              { inset: -18, delay: "0s", opacity: 0.3 },
              { inset: -36, delay: "0.6s", opacity: 0.18 },
              { inset: -54, delay: "1.2s", opacity: 0.09 },
            ].map((ring, i) => (
              <Box
                key={i}
                sx={{
                  position: "absolute",
                  inset: ring.inset,
                  borderRadius: "50%",
                  border: `2px solid rgba(123,111,255,${ring.opacity})`,
                  animation: `orbPulseRing 3s ease-out infinite`,
                  animationDelay: ring.delay,
                  "@keyframes orbPulseRing": {
                    "0%": { transform: "scale(0.9)", opacity: 0.8 },
                    "100%": { transform: "scale(1.4)", opacity: 0 },
                  },
                }}
              />
            ))}
            {/* WebGL Orb */}
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

      {/* Zone 3: Streaming text (bottom zone, fixed height) */}
      <Box
        sx={{
          width: "100%",
          px: "20px",
          textAlign: "center",
          height: 52,
          mb: "20px",
          mt: "12px",
          flexShrink: 0,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {streamingText && (
          <Typography
            sx={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "rgba(255,255,255,0.88)",
              lineHeight: 1.7,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
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
            {streamingText}
          </Typography>
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
