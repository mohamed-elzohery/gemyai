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
        // Add responsive padding top here
        // 'md' is the medium breakpoint (900px by default)
        pt: {
          xs: 0, // 0px on extra-small/small screens
          md: 4, // 32px on medium screens and up (4 * 8px theme spacing)
        },
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
