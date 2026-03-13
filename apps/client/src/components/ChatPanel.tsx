import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SendIcon from "@mui/icons-material/Send";
import { iconBtnSmSx } from "../theme";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Visual-only chat panel shell — slides in from the right. */
export default function ChatPanel({ open, onClose }: ChatPanelProps) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        bgcolor: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          px: "20px",
          py: "18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <IconButton
            onClick={onClose}
            aria-label="Close chat"
            sx={{ ...iconBtnSmSx, width: 36, height: 36, minWidth: 36, minHeight: 36 }}
          >
            <ArrowBackIcon sx={{ width: 18, height: 18 }} />
          </IconButton>
          <Typography
            sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#f3f4f6" }}
          >
            Conversation
          </Typography>
        </Box>

        {/* Live badge */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            px: "10px",
            py: "4px",
            borderRadius: 9999,
            bgcolor: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.2)",
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "#22c55e",
              animation: "dotPulse 1.5s ease-in-out infinite",
              "@keyframes dotPulse": {
                "0%, 100%": { opacity: 1, transform: "scale(1)" },
                "50%": { opacity: 0.5, transform: "scale(0.75)" },
              },
            }}
          />
          <Typography
            sx={{ fontSize: "10px", fontWeight: 500, color: "#4ade80" }}
          >
            Live
          </Typography>
        </Box>
      </Box>

      {/* ── Messages ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: "16px",
          py: "16px",
          /* Hide scrollbar */
          "&::-webkit-scrollbar": { display: "none" },
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* AI message */}
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <Box
              sx={{
                bgcolor: "rgba(123,111,255,0.12)",
                border: "1px solid rgba(123,111,255,0.18)",
                borderRadius: "14px 14px 14px 4px",
                color: "#e2e0ff",
                px: "14px",
                py: "10px",
                maxWidth: "80%",
              }}
            >
              <Typography sx={{ fontSize: "13px", lineHeight: 1.6 }}>
                Hello! I'm Gemy, your AI assistant. How can I help you today?
              </Typography>
            </Box>
          </Box>

          {/* User message */}
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Box
              sx={{
                bgcolor: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "14px 14px 4px 14px",
                color: "#f3f4f6",
                px: "14px",
                py: "10px",
                maxWidth: "80%",
              }}
            >
              <Typography sx={{ fontSize: "13px", lineHeight: 1.6 }}>
                Can you tell me about the weather?
              </Typography>
            </Box>
          </Box>

          {/* AI message */}
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <Box
              sx={{
                bgcolor: "rgba(123,111,255,0.12)",
                border: "1px solid rgba(123,111,255,0.18)",
                borderRadius: "14px 14px 14px 4px",
                color: "#e2e0ff",
                px: "14px",
                py: "10px",
                maxWidth: "80%",
              }}
            >
              <Typography sx={{ fontSize: "13px", lineHeight: 1.6 }}>
                I'd be happy to help with the weather! Based on your location,
                it looks like it's currently partly cloudy with a temperature of
                around 22°C.
              </Typography>
            </Box>
          </Box>

          {/* User message */}
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Box
              sx={{
                bgcolor: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "14px 14px 4px 14px",
                color: "#f3f4f6",
                px: "14px",
                py: "10px",
                maxWidth: "80%",
              }}
            >
              <Typography sx={{ fontSize: "13px", lineHeight: 1.6 }}>
                Thanks! What about tomorrow?
              </Typography>
            </Box>
          </Box>

          {/* AI message */}
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <Box
              sx={{
                bgcolor: "rgba(123,111,255,0.12)",
                border: "1px solid rgba(123,111,255,0.18)",
                borderRadius: "14px 14px 14px 4px",
                color: "#e2e0ff",
                px: "14px",
                py: "10px",
                maxWidth: "80%",
              }}
            >
              <Typography sx={{ fontSize: "13px", lineHeight: 1.6 }}>
                Tomorrow is looking great — sunny skies with highs around 25°C.
                Perfect for outdoor activities!
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Input bar ── */}
      <Box
        sx={{
          flexShrink: 0,
          px: "16px",
          pt: "12px",
          pb: "16px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Box
            component="input"
            type="text"
            placeholder="Type a message..."
            sx={{
              flex: 1,
              fontSize: "0.875rem",
              borderRadius: "12px",
              py: "12px",
              px: "16px",
              bgcolor: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#f3f4f6",
              outline: "none",
              caretColor: "#a78bfa",
              "&::placeholder": { color: "rgba(255,255,255,0.3)" },
              "&:focus": { borderColor: "rgba(123,111,255,0.5)" },
            }}
          />
          <IconButton
            aria-label="Send message"
            sx={{
              width: 42,
              height: 42,
              minWidth: 42,
              minHeight: 42,
              borderRadius: "50%",
              bgcolor: "rgba(123,111,255,0.25)",
              border: "1px solid rgba(123,111,255,0.35)",
              color: "#c4b5fd",
              "&:hover": { bgcolor: "rgba(123,111,255,0.35)" },
            }}
          >
            <SendIcon sx={{ width: 18, height: 18 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
