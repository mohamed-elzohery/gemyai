import { useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import VoiceOrb from "./VoiceOrb";
import ImageViewerModal from "./ImageViewerModal";

export interface ResponseState {
  mode: "idle" | "listening" | "text" | "image" | "status";
  text?: string;
  imageUrl?: string;
  statusText?: string;
  isPartial?: boolean;
}

interface ResponsePreviewProps {
  response: ResponseState;
}

export default function ResponsePreview({ response }: ResponsePreviewProps) {
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
    // If the user scrolled up (away from bottom), mark it
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
      {/* Idle / Listening → Orb */}
      {(response.mode === "idle" || response.mode === "listening") && (
        <VoiceOrb state={response.mode === "listening" ? "listening" : "idle"} />
      )}

      {/* Status → Pulsing status text with orb underneath */}
      {response.mode === "status" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            width: "100%",
            height: "100%",
          }}
        >
          <VoiceOrb state="listening" />
          <Typography
            variant="body1"
            sx={{
              position: "absolute",
              bottom: { xs: "8%", md: "12%" },
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
            {response.statusText}
          </Typography>
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
            py: { xs: 3, md: 4 },
            WebkitOverflowScrolling: "touch",
          }}
        >
          <Typography
            component="div"
            sx={{
              fontSize: { xs: "1.4rem", sm: "1.6rem", md: "1.85rem" },
              fontWeight: 500,
              lineHeight: 1.6,
              color: "text.primary",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              flexGrow: 1,
            }}
          >
            {response.text}
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

      {/* Image → Full area image with tap to enlarge */}
      {response.mode === "image" && response.imageUrl && (
        <>
          <Box
            component="img"
            src={response.imageUrl}
            alt="AI response image"
            onClick={() => setImageModalOpen(true)}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              cursor: "pointer",
              userSelect: "none",
              WebkitTouchCallout: "none",
            }}
          />
          <ImageViewerModal
            open={imageModalOpen}
            imageUrl={response.imageUrl}
            onClose={() => setImageModalOpen(false)}
          />
        </>
      )}
    </Box>
  );
}
