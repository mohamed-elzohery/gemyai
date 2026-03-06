import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import VideocamIcon from "@mui/icons-material/Videocam";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { randomId } from "../utils/textHelpers";
import { useAuth } from "../contexts/AuthContext";
import Orb from "../components/Orb";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, loading, login, logout } = useAuth();

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

        {loading ? null : user ? (
          <>
            {/* Authenticated state */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar src={user.picture} alt={user.name} />
              <Typography variant="body1" color="text.primary">
                {user.name}
              </Typography>
            </Stack>
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
            <Button
              variant="text"
              color="inherit"
              size="small"
              startIcon={<LogoutIcon />}
              onClick={logout}
            >
              Sign out
            </Button>
          </>
        ) : (
          /* Not authenticated — show Google Sign-In */
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              if (credentialResponse.credential) {
                login(credentialResponse.credential);
              }
            }}
            onError={() => {
              console.error("Google login failed");
            }}
            theme="filled_blue"
            size="large"
            shape="pill"
          />
        )}
      </Stack>
    </Box>
  );
}
