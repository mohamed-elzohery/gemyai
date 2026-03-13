import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import Orb from "./Orb";
import type { AgentState } from "./Orb";
import ImageViewerModal from "./ImageViewerModal";

export interface ResponseState {
  mode: "idle" | "listening" | "text" | "image" | "thinking" | "attachment";
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
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  // Track whether user has scrolled up manually
  const userScrolledRef = useRef(false);
  const prevScrollTopRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (scrollTop < prevScrollTopRef.current && !isNearBottom) {
      userScrolledRef.current = true;
    } else if (isNearBottom) {
      userScrolledRef.current = false;
    }
    prevScrollTopRef.current = scrollTop;
  }, []);

  // Auto-scroll to bottom for each new text chunk unless user scrolled up
  useEffect(() => {
    if (response.mode === "text" && !userScrolledRef.current) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [response.text, response.mode]);

  // Reset scroll tracking when mode changes
  useEffect(() => {
    userScrolledRef.current = false;
  }, [response.mode]);

  // ---------------------------------------------------------------------------
  // Map response mode → Orb AgentState
  // ---------------------------------------------------------------------------
  const orbAgentState: AgentState = useMemo(() => {
    switch (response.mode) {
      case "listening":
        return "listening";
      case "thinking":
        return "thinking";
      case "text":
        return "talking";
      default:
        return null;
    }
  }, [response.mode]);

  // Color presets per state
  const orbColors: [string, string] = useMemo(() => {
    switch (response.mode) {
      case "listening":
        return [theme.palette.primary.light, theme.palette.primary.main];
      case "thinking":
        return [theme.palette.secondary.light, theme.palette.secondary.main];
      default:
        return ["#90CAF9", "#42A5F5"];
    }
  }, [response.mode, theme]);

  // ---------------------------------------------------------------------------
  // Text with last-word primary-color highlight
  // ---------------------------------------------------------------------------
  const renderedText = useMemo(() => {
    const raw = response.text ?? "";
    if (!raw || !response.isPartial) return raw;

    const trimmed = raw.trimEnd();
    const lastSpace = trimmed.lastIndexOf(" ");
    if (lastSpace < 0) {
      return (
        <>
          <Box
            component="span"
            sx={{ color: "primary.main", transition: "color 0.2s" }}
          >
            {trimmed}
          </Box>
          {raw.slice(trimmed.length)}
        </>
      );
    }

    return (
      <>
        {trimmed.slice(0, lastSpace + 1)}
        <Box
          component="span"
          sx={{ color: "primary.main", transition: "color 0.2s" }}
        >
          {trimmed.slice(lastSpace + 1)}
        </Box>
        {raw.slice(trimmed.length)}
      </>
    );
  }, [response.text, response.isPartial]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* Idle / Listening / Thinking → Orb */}
      {(response.mode === "idle" ||
        response.mode === "listening" ||
        response.mode === "thinking") && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          <Box
            sx={{
              width: { xs: 220, sm: 260, md: 300 },
              height: { xs: 220, sm: 260, md: 300 },
            }}
          >
            <Orb agentState={orbAgentState} colors={orbColors} />
          </Box>

          {/* Phase label below the orb — Listening / Thinking */}
          {(response.mode === "listening" ||
            (response.mode === "thinking" && response.statusText)) && (
            <Typography
              variant="body1"
              sx={{
                mt: 3,
                color: "text.secondary",
                fontWeight: 600,
                fontStyle: "italic",
                textAlign: "center",
                px: 3,
                animation: "statusPulse 1.5s ease-in-out infinite",
                "@keyframes statusPulse": {
                  "0%, 100%": { opacity: 0.6 },
                  "50%": { opacity: 1 },
                },
              }}
            >
              {response.mode === "listening"
                ? "Listening..."
                : response.statusText}
            </Typography>
          )}
        </Box>
      )}

      {/* Text → Streaming response */}
      {response.mode === "text" && (
        <Box
          ref={containerRef}
          onScroll={handleScroll}
          sx={{
            width: "100%",
            height: "100%",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            px: { xs: 3, md: 6 },
            py: { xs: 3, md: 12 },
            WebkitOverflowScrolling: "touch",
          }}
        >
          <Typography
            component="div"
            sx={{
              fontSize: { xs: "2rem" },
              fontWeight: 500,
              lineHeight: 1.65,
              color: "text.primary",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              flexGrow: 1,
            }}
          >
            {renderedText}
            {response.isPartial && (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: 3,
                  height: "1.2em",
                  bgcolor: "primary.main",
                  ml: 0.5,
                  verticalAlign: "text-bottom",
                  animation: "cursorBlink 1s step-end infinite",
                  "@keyframes cursorBlink": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0 },
                  },
                }}
              />
            )}
          </Typography>
          <div ref={scrollRef} />
        </Box>
      )}

      {/* Image (annotated) → Shows in Orb area, replaces Orb */}
      {response.mode === "image" && response.imageUrl && (
        <>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              position: "relative",
            }}
          >
            <Box
              sx={{
                width: { xs: 280, sm: 340, md: 400 },
                height: { xs: 280, sm: 340, md: 400 },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 3,
                overflow: "hidden",
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
                  borderRadius: 2,
                  animation: "imageFadeIn 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
                  "@keyframes imageFadeIn": {
                    from: { opacity: 0, transform: "scale(0.92)" },
                    to: { opacity: 1, transform: "scale(1)" },
                  },
                }}
              />
            </Box>
          </Box>
          <ImageViewerModal
            open={imageModalOpen}
            imageUrl={response.imageUrl}
            onClose={() => setImageModalOpen(false)}
          />
        </>
      )}

      {/* Attachment → Download card */}
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
          {/* PDF icon */}
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
            variant="h6"
            sx={{ color: "text.primary", fontWeight: 600, textAlign: "center" }}
          >
            {response.text || "Service Report"}
          </Typography>

          <Typography
            variant="body2"
            sx={{ color: "text.secondary", textAlign: "center", maxWidth: 300 }}
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
  );
}
