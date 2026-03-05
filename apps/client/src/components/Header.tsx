import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";

interface HeaderProps {
  connected: boolean;
  proactivity: boolean;
  affectiveDialog: boolean;
  onProactivityChange: (checked: boolean) => void;
  onAffectiveDialogChange: (checked: boolean) => void;
}

export default function Header({
  connected,
  proactivity,
  affectiveDialog,
  onProactivityChange,
  onAffectiveDialogChange,
}: HeaderProps) {
  return (
    <AppBar
      position="static"
      sx={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <Toolbar sx={{ flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="h1">
            ADK Gemini Live API Toolkit Demo
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            Real-time bidirectional streaming with Google ADK
          </Typography>
        </Box>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={proactivity}
              onChange={(_, c) => onProactivityChange(c)}
            />
          }
          label="Proactivity"
          title="Enable model to proactively respond without explicit prompts (Native audio models only)"
          sx={{
            color: "inherit",
            "& .MuiTypography-root": { fontSize: "0.8rem" },
          }}
        />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={affectiveDialog}
              onChange={(_, c) => onAffectiveDialogChange(c)}
            />
          }
          label="Affective Dialog"
          title="Enable model to detect and adapt to emotional cues (Native audio models only)"
          sx={{
            color: "inherit",
            "& .MuiTypography-root": { fontSize: "0.8rem" },
          }}
        />

        <Chip
          size="small"
          label={connected ? "Connected" : "Disconnected"}
          color={connected ? "success" : "error"}
          variant="filled"
          sx={{ color: "#fff" }}
        />
      </Toolbar>
    </AppBar>
  );
}
