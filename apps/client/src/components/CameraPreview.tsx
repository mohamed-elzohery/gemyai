import Box from "@mui/material/Box";

interface CameraPreviewProps {
  visible: boolean;
  speaking: boolean;
}

export default function CameraPreview({
  visible,
  speaking,
}: CameraPreviewProps) {
  return (
    <Box
      sx={{
        display: visible ? "block" : "none",
        position: "absolute",
        bottom: "5.5rem",
        right: "1.5rem",
        width: 180,
        height: 135,
        borderRadius: 2,
        overflow: "hidden",
        boxShadow: speaking
          ? "0 4px 16px rgba(52, 168, 83, 0.4)"
          : "0 4px 16px rgba(0, 0, 0, 0.25)",
        zIndex: 50,
        bgcolor: "#000",
        border: 2,
        borderColor: speaking ? "success.main" : "rgba(255,255,255,0.2)",
        transition: "border-color 0.3s ease",
      }}
    >
      <Box
        component="video"
        id="cameraPreviewLive"
        autoPlay
        playsInline
        muted
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
        }}
      />
      {/* VAD indicator dot */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: speaking ? "success.main" : "grey.600",
          boxShadow: speaking ? "0 0 6px rgba(52, 168, 83, 0.6)" : "none",
          transition: "background-color 0.2s ease",
          animation: speaking ? "vadPulse 1s ease-in-out infinite" : "none",
          "@keyframes vadPulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.6 },
          },
        }}
      />
    </Box>
  );
}
