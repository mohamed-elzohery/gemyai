import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import VideocamIcon from "@mui/icons-material/Videocam";
import { useNavigate } from "react-router-dom";
import { randomId } from "../utils/textHelpers";
import Orb from "../components/Orb";

export default function HomePage() {
  const navigate = useNavigate();

  const handleStart = () => {
    const id = "session-" + randomId();
    navigate(`/session/${id}`);
  };

  return (
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 3,
      }}
    >
      <Stack
        spacing={4}
        alignItems="center"
        sx={{ maxWidth: 420, textAlign: "center" }}
      >
        {/* Logo / Orb teaser */}
        <Orb />
        <Typography variant="h3" component="h1" color="text.primary">
          Gemy AI
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Your hands-free AI assistant. Start a session to begin a voice
          conversation.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<VideocamIcon />}
          onClick={handleStart}
          sx={{ mt: 2 }}
        >
          Start a Session
        </Button>
      </Stack>
    </Box>
  );
}
