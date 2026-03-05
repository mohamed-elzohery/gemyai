import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ConsoleEntry } from "../types";

interface ConsoleEntryProps {
  entry: ConsoleEntry;
}

const borderColors: Record<string, string> = {
  outgoing: "#4285f4",
  incoming: "#34a853",
  error: "#ea4335",
};

const typeLabels: Record<string, string> = {
  outgoing: "↑ Upstream",
  incoming: "↓ Downstream",
  error: "⚠ Error",
};

const typeLabelColors: Record<string, string> = {
  outgoing: "#4285f4",
  incoming: "#34a853",
  error: "#ea4335",
};

const authorColors: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  user: {
    bg: "rgba(66, 133, 244, 0.2)",
    color: "#80b3ff",
    border: "rgba(66, 133, 244, 0.4)",
  },
  system: {
    bg: "rgba(133, 133, 133, 0.2)",
    color: "#b0b0b0",
    border: "rgba(133, 133, 133, 0.3)",
  },
};

const defaultAuthorColor = {
  bg: "rgba(156, 220, 254, 0.15)",
  color: "#9cdcfe",
  border: "rgba(156, 220, 254, 0.3)",
};

export default function ConsoleEntryItem({ entry }: ConsoleEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const hasData = !!entry.data;

  const authorStyle = entry.author
    ? authorColors[entry.author] || defaultAuthorColor
    : null;

  return (
    <Box
      onClick={() => hasData && setExpanded((p) => !p)}
      sx={{
        mb: 1,
        p: 0.75,
        borderLeft: `3px solid ${borderColors[entry.type] || "transparent"}`,
        bgcolor: expanded ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
        borderRadius: 0.5,
        cursor: hasData ? "pointer" : "default",
        "&:hover": hasData ? { bgcolor: "rgba(255,255,255,0.10)" } : undefined,
      }}
    >
      {/* Header row */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 0.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {entry.emoji && (
            <Typography
              component="span"
              sx={{ fontSize: "0.9rem", lineHeight: 1 }}
            >
              {entry.emoji}
            </Typography>
          )}
          {hasData && (
            <Typography
              component="span"
              sx={{ fontSize: "0.6rem", color: "#858585", width: 12 }}
            >
              {expanded ? "▼" : "▶"}
            </Typography>
          )}
          <Typography
            component="span"
            sx={{
              fontWeight: 600,
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: typeLabelColors[entry.type],
            }}
          >
            {typeLabels[entry.type]}
          </Typography>
          {authorStyle && entry.author && (
            <Typography
              component="span"
              sx={{
                fontSize: "0.65rem",
                fontWeight: 500,
                px: 0.5,
                py: 0.125,
                borderRadius: 0.5,
                bgcolor: authorStyle.bg,
                color: authorStyle.color,
                border: `1px solid ${authorStyle.border}`,
              }}
            >
              {entry.author}
            </Typography>
          )}
        </Box>
        <Typography
          component="span"
          sx={{ color: "#858585", fontSize: "0.65rem" }}
        >
          {entry.timestamp}
        </Typography>
      </Box>

      {/* Content */}
      {entry.content && (
        <Typography
          sx={{
            color: "#d4d4d4",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "0.7rem",
            lineHeight: 1.4,
            pl: 3.5,
          }}
        >
          {entry.content}
        </Typography>
      )}

      {/* Expandable JSON */}
      {hasData && expanded && (
        <Box
          component="pre"
          sx={{
            bgcolor: "#252526",
            p: 0.75,
            borderRadius: 0.5,
            mt: 0.75,
            overflowX: "auto",
            maxHeight: 400,
            overflowY: "auto",
            m: 0,
            color: "#9cdcfe",
            fontSize: "0.7rem",
          }}
        >
          {JSON.stringify(entry.data, null, 2)}
        </Box>
      )}
    </Box>
  );
}
