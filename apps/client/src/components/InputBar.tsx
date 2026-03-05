import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import SendIcon from "@mui/icons-material/Send";
import VideocamIcon from "@mui/icons-material/Videocam";

interface InputBarProps {
  onSend: (text: string) => void;
  onStartSession: () => void;
  sessionStarted: boolean;
  sessionLoading: boolean;
  sendEnabled: boolean;
}

export default function InputBar({
  onSend,
  onStartSession,
  sessionStarted,
  sessionLoading,
  sendEnabled,
}: InputBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: "flex",
        gap: 1,
        p: 2,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <TextField
        fullWidth
        size="small"
        placeholder="Type your message here..."
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 6 } }}
      />

      <IconButton
        type="submit"
        color="primary"
        disabled={!sendEnabled || !value.trim()}
      >
        <SendIcon />
      </IconButton>

      {!sessionStarted && (
        <Button
          variant="contained"
          color="success"
          startIcon={<VideocamIcon />}
          onClick={onStartSession}
          disabled={sessionLoading}
          sx={{ whiteSpace: "nowrap", borderRadius: 6 }}
        >
          {sessionLoading ? "Starting..." : "Start Session"}
        </Button>
      )}
    </Box>
  );
}
