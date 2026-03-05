import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import type { ConsoleEntry } from "../types";
import ConsoleEntryItem from "./ConsoleEntry";

interface EventConsoleProps {
  entries: ConsoleEntry[];
  showAudioEvents: boolean;
  onShowAudioEventsChange: (checked: boolean) => void;
  onClear: () => void;
}

export default function EventConsole({
  entries,
  showAudioEvents,
  onShowAudioEventsChange,
  onClear,
}: EventConsoleProps) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#1e1e1e",
        color: "#d4d4d4",
        fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 1.5,
          py: 1,
          bgcolor: "#2d2d2d",
          borderBottom: "1px solid #3e3e3e",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: "#ccc",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Event Console
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={showAudioEvents}
                onChange={(_, c) => onShowAudioEventsChange(c)}
                sx={{
                  color: "#666",
                  "&.Mui-checked": { color: "#4285f4" },
                  p: 0.5,
                }}
              />
            }
            label="Show audio"
            sx={{
              color: "#999",
              "& .MuiTypography-root": { fontSize: "0.75rem" },
              mr: 0,
            }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={onClear}
            sx={{
              color: "#ccc",
              borderColor: "#4e4e4e",
              bgcolor: "#3e3e3e",
              fontSize: "0.75rem",
              minWidth: 0,
              px: 1,
              py: 0.25,
              "&:hover": { bgcolor: "#4e4e4e", borderColor: "#5e5e5e" },
            }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, fontSize: "0.75rem" }}>
        {entries.map((entry) => (
          <ConsoleEntryItem key={entry.id} entry={entry} />
        ))}
      </Box>
    </Box>
  );
}
