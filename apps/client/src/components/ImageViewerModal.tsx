import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import CloseIcon from "@mui/icons-material/Close";

interface ImageViewerModalProps {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
}

export default function ImageViewerModal({
  open,
  imageUrl,
  onClose,
}: ImageViewerModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      slotProps={{
        paper: {
          sx: {
            bgcolor: "rgba(0,0,0,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        },
      }}
    >
      {/* Close button */}
      <IconButton
        onClick={onClose}
        aria-label="Close image viewer"
        sx={{
          position: "absolute",
          top: { xs: "env(safe-area-inset-top, 12px)", md: 16 },
          right: { xs: 12, md: 16 },
          zIndex: 10,
          color: "#fff",
          bgcolor: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(8px)",
          "&:hover": { bgcolor: "rgba(255,255,255,0.25)" },
          width: 48,
          height: 48,
        }}
      >
        <CloseIcon sx={{ fontSize: 28 }} />
      </IconButton>

      {/* Image */}
      <Box
        component="img"
        src={imageUrl}
        alt="Full size preview"
        sx={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          userSelect: "none",
          WebkitTouchCallout: "none",
        }}
      />
    </Dialog>
  );
}
