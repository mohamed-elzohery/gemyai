import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import VideocamIcon from "@mui/icons-material/Videocam";
import { useNavigate } from "react-router-dom";
import { randomId } from "../utils/textHelpers";

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
        <Box
          sx={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, #90CAF9 0%, #42A5F5 50%, #1565C0 100%)",
            boxShadow: "0 0 30px rgba(21,101,192,0.25)",
            animation: "homeOrbBreath 3.5s ease-in-out infinite",
            "@keyframes homeOrbBreath": {
              "0%": { transform: "scale(0.96)" },
              "50%": { transform: "scale(1.04)" },
              "100%": { transform: "scale(0.96)" },
            },
          }}
        />

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
