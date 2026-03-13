import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { glassCardSx, iconBtnSmSx } from "../theme";

interface SessionTopBarProps {
  connected: boolean;
  chatOpen: boolean;
  onBack: () => void;
  onToggleChat: () => void;
}

export default function SessionTopBar({
  connected,
  chatOpen,
  onBack,
  onToggleChat,
}: SessionTopBarProps) {
  return (
    <Box
      sx={{
        ...glassCardSx,
        flexShrink: 0,
        height: { xs: "4.2rem", lg: 80 },
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: "20px",
      }}
    >
      {/* Left: Back + Title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <IconButton
          onClick={onBack}
          aria-label="Go back"
          sx={{ ...iconBtnSmSx }}
        >
          <ArrowBackIcon sx={{ width: 20, height: 20 }} />
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Connection dot */}
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: connected ? "#22c55e" : "#f87171",
              animation: connected
                ? "dotPulse 1.5s ease-in-out infinite"
                : "none",
              "@keyframes dotPulse": {
                "0%, 100%": { opacity: 1, transform: "scale(1)" },
                "50%": { opacity: 0.5, transform: "scale(0.75)" },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: "1rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "#f3f4f6",
            }}
          >
            Gemy AI
          </Typography>
        </Box>
      </Box>

      {/* Right: Chat toggle */}
      <IconButton
        onClick={onToggleChat}
        aria-label={chatOpen ? "Close chat" : "Open chat"}
        sx={{
          ...iconBtnSmSx,
          ...(chatOpen && {
            bgcolor: "rgba(123,111,255,0.2)",
            borderColor: "rgba(123,111,255,0.35)",
          }),
        }}
      >
        <ChatBubbleOutlineIcon sx={{ width: 19, height: 19 }} />
      </IconButton>
    </Box>
  );
}
