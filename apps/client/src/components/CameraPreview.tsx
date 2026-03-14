import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import VideocamIcon from "@mui/icons-material/Videocam";
import { glassCardSx } from "../theme";

interface CameraPreviewProps {
  visible: boolean;
  /** Whether the camera stream is actually playing (prevents black flash) */
  ready?: boolean;
}

export default function CameraPreview({
  visible,
  ready = true,
}: CameraPreviewProps) {
  return (
    <Box
      sx={[
        {
          ...glassCardSx,
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          maxWidth: 1000,
          maxHeight: 1000,
          /* collapse transitions */
          transition:
            "flex 0.4s ease, max-height 0.4s ease, max-width 0.4s ease, min-width 0.4s ease, opacity 0.35s ease, padding 0.4s ease, margin 0.4s ease",
        },
        /* Mobile (xs): 1/3 of parent when visible */
        visible
          ? {
              flex: { xs: "1 1 0", lg: "unset" },
              minHeight: { xs: 0, lg: "auto" },
            }
          : {},
        /* Desktop (lg): 1/3 width, stretch vertically */
        (theme) => ({
          [theme.breakpoints.up("lg")]: {
            ...(visible && {
              width: "33.333%",
              alignSelf: "stretch",
              flexShrink: 0,
            }),
          },
        }),
        /* Collapsed state */
        ...(!visible
          ? [
              {
                flex: "0 0 0 !important" as const,
                maxHeight: "0 !important",
                maxWidth: "0 !important",
                minWidth: "0 !important",
                opacity: 0,
                p: "0 !important",
                m: "0 !important",
                border: "none !important",
                overflow: "hidden" as const,
              },
            ]
          : []),
      ]}
    >
      {/* Video */}
      <Box
        component="video"
        id="cameraPreviewLive"
        autoPlay
        playsInline
        muted
        sx={{
          display: "block",
          width: "100%",
          borderRadius: "10px",
          transform: "scaleX(-1)",
          height: "100%",
          objectFit: "contain",
          /* Fade in once stream is ready — prevents black flash */
          opacity: ready ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* "Preview" label overlay */}
      <Box
        sx={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          alignItems: "center",
          gap: "6px",
          bgcolor: "rgba(0,0,0,0.6)",
          borderRadius: "8px",
          py: "4px",
          pl: "8px",
          pr: "10px",
        }}
      >
        <VideocamIcon
          sx={{ width: 13, height: 13, color: "rgba(255,255,255,0.8)" }}
        />
        <Typography
          sx={{
            fontSize: "11px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Preview
        </Typography>
      </Box>

      {/* Camera fallback */}
      <Box
        id="camera-fallback"
        sx={{
          position: "absolute",
          inset: 0,
          display: "none",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <Typography
          sx={{
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "rgba(255,255,255,0.35)",
          }}
        >
          Camera unavailable
        </Typography>
      </Box>
    </Box>
  );
}
