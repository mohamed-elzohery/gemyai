import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ChatMessage } from "../types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { type, text, imageUrl, isPartial, isInterrupted } = message;

  // System messages
  if (type === "system") {
    return (
      <Typography
        variant="body2"
        sx={{
          textAlign: "center",
          color: "text.secondary",
          fontStyle: "italic",
          py: 0.5,
          my: 1,
        }}
      >
        {text}
      </Typography>
    );
  }

  const isUser =
    type === "user-text" ||
    type === "user-image" ||
    type === "input-transcription";
  const isStatus = type === "agent-status";
  const isGroundingLoading = type === "grounding-loading";
  const isTranscription =
    type === "input-transcription" || type === "output-transcription";
  const isImage = type === "user-image" || type === "agent-image";

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 0.5,
        opacity: isInterrupted ? 0.6 : 1,
      }}
    >
      <Paper
        elevation={1}
        sx={{
          maxWidth: "70%",
          px: isImage ? 0.5 : 1.5,
          py: isImage ? 0.5 : 1,
          borderRadius: 3,
          borderBottomRightRadius: isUser ? 1 : undefined,
          borderBottomLeftRadius: !isUser ? 1 : undefined,
          bgcolor: isStatus
            ? "rgba(52, 168, 83, 0.08)"
            : isGroundingLoading
              ? "rgba(66, 133, 244, 0.08)"
              : isUser
                ? "primary.main"
                : "grey.100",
          color:
            isUser && !isStatus && !isGroundingLoading
              ? "primary.contrastText"
              : "text.primary",
          border: isStatus
            ? "1px solid rgba(52, 168, 83, 0.25)"
            : isGroundingLoading
              ? "1px solid rgba(66, 133, 244, 0.25)"
              : isInterrupted
                ? "1px solid"
                : "none",
          borderLeftColor: isInterrupted ? "warning.main" : undefined,
          borderLeftWidth: isInterrupted ? 3 : undefined,
          animation:
            isStatus || isGroundingLoading
              ? "pulse 1.5s ease-in-out infinite"
              : undefined,
          "@keyframes pulse": {
            "0%, 100%": { opacity: 0.6 },
            "50%": { opacity: 1 },
          },
        }}
      >
        {isImage && imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt="Captured"
            sx={{
              maxWidth: "100%",
              maxHeight: 300,
              borderRadius: 1.5,
              display: "block",
              objectFit: "contain",
            }}
          />
        ) : (
          <Typography
            variant="body2"
            sx={{
              lineHeight: 1.5,
              fontStyle: isStatus || isGroundingLoading ? "italic" : "normal",
              color: isStatus
                ? "success.main"
                : isGroundingLoading
                  ? "primary.main"
                  : undefined,
            }}
          >
            {isTranscription && isUser && "🎤 "}
            {text}
            {isPartial && (
              <Box component="span" sx={{ ml: 0.5, color: "text.secondary" }}>
                ...
              </Box>
            )}
          </Typography>
        )}
        {isInterrupted && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontStyle: "italic", mt: 0.5 }}
          >
            interrupted
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
