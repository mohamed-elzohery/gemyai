import { createTheme } from "@mui/material/styles";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";

const fontFamily = [
  '"Atkinson Hyperlegible"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Roboto",
  "sans-serif",
].join(",");

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1565C0",
      light: "#42A5F5",
      dark: "#0D47A1",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#00695C",
      light: "#26A69A",
      dark: "#004D40",
      contrastText: "#FFFFFF",
    },
    error: {
      main: "#C62828",
      light: "#EF5350",
      dark: "#B71C1C",
    },
    success: {
      main: "#2E7D32",
      light: "#66BB6A",
      dark: "#1B5E20",
    },
    warning: {
      main: "#E65100",
      light: "#FF9800",
      dark: "#BF360C",
    },
    background: {
      default: "#FFFFFF",
      paper: "#F5F5F5",
    },
    text: {
      primary: "#1A1A1A",
      secondary: "#424242",
    },
    divider: "rgba(0,0,0,0.12)",
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
    borderRadius: 16,
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
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
      },
    },
  },
});

export default theme;
