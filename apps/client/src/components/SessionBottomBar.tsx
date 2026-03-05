import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CallEndIcon from "@mui/icons-material/CallEnd";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

interface SessionBottomBarProps {
  visible: boolean;
  cameraOn: boolean;
  micOn: boolean;
  previewVisible: boolean;
  onEndSession: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onTogglePreview: () => void;
}

export default function SessionBottomBar({
  visible,
  cameraOn,
  micOn,
  previewVisible,
  onEndSession,
  onToggleCamera,
  onToggleMic,
  onTogglePreview,
}: SessionBottomBarProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const show = isDesktop || visible;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: 2, md: 3 },
        px: 2,
        py: 1.5,
        pb: { xs: "max(env(safe-area-inset-bottom, 12px), 12px)", md: 1.5 },
        bgcolor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid",
        borderColor: "divider",
        transform: show ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      {/* Camera toggle */}
      <IconButton
        onClick={onToggleCamera}
        aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
        sx={{
          width: 48,
          height: 48,
          bgcolor: cameraOn ? "action.hover" : "grey.300",
          color: cameraOn ? "text.primary" : "text.secondary",
          "&:hover": {
            bgcolor: cameraOn ? "action.selected" : "grey.400",
          },
        }}
      >
        {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
      </IconButton>

      {/* Mic toggle */}
      <IconButton
        onClick={onToggleMic}
        aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        sx={{
          width: 48,
          height: 48,
          bgcolor: micOn ? "action.hover" : "grey.300",
          color: micOn ? "text.primary" : "text.secondary",
          "&:hover": {
            bgcolor: micOn ? "action.selected" : "grey.400",
          },
        }}
      >
        {micOn ? <MicIcon /> : <MicOffIcon />}
      </IconButton>

      {/* End session (red, larger) */}
      <IconButton
        onClick={onEndSession}
        aria-label="End session"
        sx={{
          width: 56,
          height: 56,
          bgcolor: "error.main",
          color: "#fff",
          "&:hover": {
            bgcolor: "error.dark",
          },
        }}
      >
        <CallEndIcon sx={{ fontSize: 28 }} />
      </IconButton>

      {/* Preview toggle */}
      <IconButton
        onClick={onTogglePreview}
        disabled={!cameraOn}
        aria-label={previewVisible ? "Hide camera preview" : "Show camera preview"}
        sx={{
          width: 48,
          height: 48,
          bgcolor:
            !cameraOn
              ? "grey.200"
              : previewVisible
                ? "action.hover"
                : "grey.300",
          color:
            !cameraOn
              ? "grey.400"
              : previewVisible
                ? "text.primary"
                : "text.secondary",
          "&:hover": {
            bgcolor: cameraOn
              ? previewVisible
                ? "action.selected"
                : "grey.400"
              : "grey.200",
          },
        }}
      >
        {previewVisible && cameraOn ? (
          <VisibilityIcon />
        ) : (
          <VisibilityOffIcon />
        )}
      </IconButton>
    </Box>
  );
}
