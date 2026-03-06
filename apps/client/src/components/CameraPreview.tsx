import Box from "@mui/material/Box";

interface CameraPreviewProps {
  visible: boolean;
}

export default function CameraPreview({ visible }: CameraPreviewProps) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: visible ? "block" : "none",
        bgcolor: "#000",
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
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
          display: "block",
        }}
      />
    </Box>
  );
}
