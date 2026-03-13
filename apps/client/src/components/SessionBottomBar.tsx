import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CallEndIcon from "@mui/icons-material/CallEnd";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CameraswitchIcon from "@mui/icons-material/Cameraswitch";
import {
  glassCardSx,
  iconBtnSx,
  iconBtnDangerSx,
  iconBtnMutedSx,
} from "../theme";

interface SessionBottomBarProps {
  cameraOn: boolean;
  micOn: boolean;
  previewVisible: boolean;
  onEndSession: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onTogglePreview: () => void;
  onSwitchCamera?: () => void;
}

export default function SessionBottomBar({
  cameraOn,
  micOn,
  previewVisible,
  onEndSession,
  onToggleCamera,
  onToggleMic,
  onTogglePreview,
  onSwitchCamera,
}: SessionBottomBarProps) {
  return (
    <Box
      sx={{
        ...glassCardSx,
        flexShrink: 0,
        height: { xs: "5rem", lg: 80 },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: "16px", sm: "24px", lg: "32px" },
        px: "12px",
      }}
    >
      {/* Mute toggle */}
      <IconButton
        onClick={onToggleMic}
        aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        sx={{
          ...iconBtnSx,
          ...(!micOn && iconBtnMutedSx),
        }}
      >
        {micOn ? (
          <MicIcon sx={{ width: 20, height: 20 }} />
        ) : (
          <MicOffIcon sx={{ width: 20, height: 20 }} />
        )}
      </IconButton>

      {/* Camera toggle */}
      <IconButton
        onClick={onToggleCamera}
        aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
        sx={{
          ...iconBtnSx,
          ...(!cameraOn && iconBtnMutedSx),
        }}
      >
        {cameraOn ? (
          <VideocamIcon sx={{ width: 20, height: 20 }} />
        ) : (
          <VideocamOffIcon sx={{ width: 20, height: 20 }} />
        )}
      </IconButton>

      {/* End session (red, larger) */}
      <IconButton
        onClick={onEndSession}
        aria-label="End session"
        sx={{ ...iconBtnDangerSx }}
      >
        <CallEndIcon sx={{ fontSize: 22 }} />
      </IconButton>

      {/* Preview toggle */}
      <IconButton
        onClick={onTogglePreview}
        disabled={!cameraOn}
        aria-label={
          previewVisible ? "Hide camera preview" : "Show camera preview"
        }
        sx={{
          ...iconBtnSx,
          ...((!previewVisible || !cameraOn) && iconBtnMutedSx),
          ...(!cameraOn && { opacity: 0.4, pointerEvents: "none" }),
        }}
      >
        {previewVisible && cameraOn ? (
          <VisibilityIcon sx={{ width: 20, height: 20 }} />
        ) : (
          <VisibilityOffIcon sx={{ width: 20, height: 20 }} />
        )}
      </IconButton>

      {/* Switch Camera */}
      {onSwitchCamera && (
        <IconButton
          onClick={onSwitchCamera}
          disabled={!cameraOn}
          aria-label="Switch camera"
          sx={{
            ...iconBtnSx,
            ...(!cameraOn && { opacity: 0.4, pointerEvents: "none" }),
          }}
        >
          <CameraswitchIcon sx={{ width: 20, height: 20 }} />
        </IconButton>
      )}
    </Box>
  );
}
