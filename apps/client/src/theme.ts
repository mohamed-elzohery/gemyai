import { createTheme } from "@mui/material/styles";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";

const fontFamily = [
  "Inter",
  '"Atkinson Hyperlegible"',
  "system-ui",
  "-apple-system",
  "sans-serif",
].join(",");

// ---------------------------------------------------------------------------
// Glass-morphism tokens (reusable across components)
// ---------------------------------------------------------------------------
export const glass = {
  bg: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  blur: "blur(20px)",
} as const;

export const glassCardSx = {
  bgcolor: glass.bg,
  border: glass.border,
  backdropFilter: glass.blur,
  WebkitBackdropFilter: glass.blur,
  borderRadius: "12px",
} as const;

/** Dark circular icon-button base style (48×48) */
export const iconBtnSx = {
  width: 48,
  height: 48,
  minWidth: 48,
  minHeight: 48,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bgcolor: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e5e7eb",
  transition: "background 0.2s ease, transform 0.15s ease, border-color 0.2s ease",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  p: 0,
  "&:hover": { bgcolor: "rgba(255,255,255,0.16)" },
  "&:active": { transform: "scale(0.92)" },
} as const;

/** Small variant (38×38) for top-bar buttons */
export const iconBtnSmSx = {
  ...iconBtnSx,
  width: 38,
  height: 38,
  minWidth: 38,
  minHeight: 38,
} as const;

/** Red end-session button (56×56) */
export const iconBtnDangerSx = {
  ...iconBtnSx,
  width: 56,
  height: 56,
  minWidth: 56,
  minHeight: 56,
  bgcolor: "#dc2626",
  borderColor: "#dc2626",
  color: "#fff",
  "&:hover": { bgcolor: "#ef4444" },
  "&:active": { transform: "scale(0.92)" },
} as const;

/** Toggled-off / muted state overlay */
export const iconBtnMutedSx = {
  bgcolor: "rgba(239,68,68,0.2)",
  borderColor: "rgba(239,68,68,0.4)",
  color: "#f87171",
  "&:hover": { bgcolor: "rgba(239,68,68,0.28)" },
} as const;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#7B6FFF",
      light: "#a78bfa",
      dark: "#4338ca",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#c4b5fd",
      light: "#e2e0ff",
      dark: "#7B6FFF",
      contrastText: "#FFFFFF",
    },
    error: {
      main: "#dc2626",
      light: "#f87171",
      dark: "#b91c1c",
    },
    success: {
      main: "#22c55e",
      light: "#4ade80",
      dark: "#16a34a",
    },
    warning: {
      main: "#f59e0b",
      light: "#fbbf24",
      dark: "#d97706",
    },
    background: {
      default: "#050505",
      paper: "#0d0d0d",
    },
    text: {
      primary: "#f3f4f6",
      secondary: "rgba(255,255,255,0.6)",
    },
    divider: "rgba(255,255,255,0.12)",
  },

  typography: {
    fontFamily,
    fontWeightMedium: 600,
    fontWeightBold: 700,

    h1: { fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: "2rem", fontWeight: 700, lineHeight: 1.3 },
    h3: { fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.3 },
    h4: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.4 },
    h5: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: "1.125rem", lineHeight: 1.6 },
    body2: { fontSize: "1rem", lineHeight: 1.5 },
    button: { fontSize: "1rem", fontWeight: 700, textTransform: "none" },
    caption: { fontSize: "0.875rem", lineHeight: 1.4 },
  },

  shape: {
    borderRadius: 12,
  },

  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          padding: "12px 32px",
          minHeight: 48,
        },
        sizeSmall: {
          padding: "8px 20px",
          minHeight: 40,
        },
        sizeLarge: {
          padding: "16px 40px",
          minHeight: 56,
          fontSize: "1.125rem",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 48,
          minHeight: 48,
        },
        sizeLarge: {
          minWidth: 56,
          minHeight: 56,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: "0.875rem",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
          backgroundColor: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.1)",
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          background: "#050505",
          color: "#fff",
          overscrollBehavior: "none",
        },
      },
    },
  },
});

export default theme;
