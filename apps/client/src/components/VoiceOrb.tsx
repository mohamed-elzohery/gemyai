import Box from "@mui/material/Box";

type OrbState = "idle" | "listening";

interface VoiceOrbProps {
  state: OrbState;
}

export default function VoiceOrb({ state }: VoiceOrbProps) {
  const isListening = state === "listening";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Outer glow ring */}
      <Box
        sx={{
          position: "absolute",
          width: { xs: 180, md: 260 },
          height: { xs: 180, md: 260 },
          borderRadius: "50%",
          background: isListening
            ? "radial-gradient(circle, rgba(21,101,192,0.20) 0%, rgba(21,101,192,0) 70%)"
            : "radial-gradient(circle, rgba(21,101,192,0.08) 0%, rgba(21,101,192,0) 70%)",
          animation: isListening
            ? "orbGlowPulse 1.2s ease-in-out infinite"
            : "orbGlowBreath 3.5s ease-in-out infinite",
          "@keyframes orbGlowPulse": {
            "0%": { transform: "scale(1)", opacity: 1 },
            "50%": { transform: "scale(1.25)", opacity: 0.6 },
            "100%": { transform: "scale(1)", opacity: 1 },
          },
          "@keyframes orbGlowBreath": {
            "0%": { transform: "scale(0.95)", opacity: 0.5 },
            "50%": { transform: "scale(1.05)", opacity: 0.8 },
            "100%": { transform: "scale(0.95)", opacity: 0.5 },
          },
        }}
      />

      {/* Secondary ring for listening */}
      {isListening && (
        <Box
          sx={{
            position: "absolute",
            width: { xs: 150, md: 220 },
            height: { xs: 150, md: 220 },
            borderRadius: "50%",
            border: "2px solid",
            borderColor: "primary.light",
            opacity: 0.4,
            animation: "orbRingExpand 1.8s ease-out infinite",
            "@keyframes orbRingExpand": {
              "0%": { transform: "scale(0.8)", opacity: 0.5 },
              "100%": { transform: "scale(1.4)", opacity: 0 },
            },
          }}
        />
      )}

      {/* Main orb */}
      <Box
        sx={{
          width: { xs: 120, md: 180 },
          height: { xs: 120, md: 180 },
          borderRadius: "50%",
          background: isListening
            ? "linear-gradient(135deg, #42A5F5 0%, #1565C0 50%, #0D47A1 100%)"
            : "linear-gradient(135deg, #90CAF9 0%, #42A5F5 50%, #1565C0 100%)",
          boxShadow: isListening
            ? "0 0 40px rgba(21,101,192,0.5), 0 0 80px rgba(66,165,245,0.3), inset 0 -4px 12px rgba(0,0,0,0.15)"
            : "0 0 20px rgba(21,101,192,0.2), 0 0 40px rgba(66,165,245,0.1), inset 0 -4px 12px rgba(0,0,0,0.1)",
          animation: isListening
            ? "orbPulseActive 0.8s ease-in-out infinite"
            : "orbBreath 3.5s ease-in-out infinite",
          transition: "box-shadow 0.4s ease, background 0.4s ease",
          position: "relative",
          zIndex: 1,

          // Specular highlight
          "&::after": {
            content: '""',
            position: "absolute",
            top: "15%",
            left: "20%",
            width: "35%",
            height: "25%",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)",
          },

          "@keyframes orbPulseActive": {
            "0%": { transform: "scale(1)" },
            "50%": { transform: "scale(1.12)" },
            "100%": { transform: "scale(1)" },
          },
          "@keyframes orbBreath": {
            "0%": { transform: "scale(0.96)" },
            "50%": { transform: "scale(1.04)" },
            "100%": { transform: "scale(0.96)" },
          },
        }}
      />

      {/* Status label below the orb */}
      <Box
        sx={{
          position: "absolute",
          bottom: { xs: "15%", md: "18%" },
          width: "100%",
          textAlign: "center",
          color: isListening ? "primary.main" : "text.secondary",
          typography: "body2",
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: "uppercase",
          transition: "color 0.3s ease",
          animation: isListening ? "labelPulse 1.2s ease-in-out infinite" : "none",
          "@keyframes labelPulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.5 },
          },
        }}
      >
        {isListening ? "Listening…" : "Ready"}
      </Box>
    </Box>
  );
}
