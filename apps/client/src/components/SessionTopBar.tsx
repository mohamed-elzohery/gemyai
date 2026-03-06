import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HistoryIcon from "@mui/icons-material/History";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";

interface SessionTopBarProps {
  visible: boolean;
  connected: boolean;
  onBack: () => void;
}

export default function SessionTopBar({
  visible,
  connected,
  onBack,
}: SessionTopBarProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const show = isDesktop || visible;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: { xs: 1.5, md: 2 },
        py: 1,
        pt: { xs: "max(env(safe-area-inset-top, 8px), 8px)", md: 1 },
        bgcolor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: { xs: "none", md: "1px solid" },
        borderColor: "divider",
        // Mobile: pill shape, inset from edges
        mx: { xs: 1, md: 0 },
        mt: { xs: 1, md: 0 },
        width: { xs: "calc(100% - 16px)", md: "100%" },
        borderRadius: { xs: 9999, md: 0 },
        boxShadow: { xs: "0 2px 8px rgba(0,0,0,0.10)", md: "none" },
        transform: show ? "translateY(0)" : "translateY(calc(-100% - 16px))",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      {/* Left section */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          onClick={onBack}
          aria-label="Go back"
          sx={{ color: "text.primary" }}
        >
          <ArrowBackIcon />
        </IconButton>

        <Chip
          size="small"
          icon={
            <FiberManualRecordIcon
              sx={{
                fontSize: 10,
                color: connected ? "success.main" : "error.main",
              }}
            />
          }
          label={connected ? "Connected" : "Disconnected"}
          variant="outlined"
          sx={{
            borderColor: connected ? "success.main" : "error.main",
            color: "text.primary",
            fontWeight: 600,
            "& .MuiChip-icon": {
              ml: 0.5,
            },
          }}
        />
      </Box>

      {/* Right section */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton
          aria-label="Session history"
          sx={{ color: "text.secondary" }}
          disabled
        >
          <HistoryIcon />
        </IconButton>
        <IconButton
          aria-label="Chat messages"
          sx={{ color: "text.secondary" }}
          disabled
        >
          <ChatBubbleOutlineIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
