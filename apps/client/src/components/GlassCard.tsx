import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { glassCardSx } from "../theme";

interface GlassCardProps {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Reusable glass-morphism container.
 * Applies the shared `glassCardSx` tokens and merges any extra `sx` overrides.
 */
export default function GlassCard({ children, sx }: GlassCardProps) {
  return (
    <Box
      sx={[
        { ...glassCardSx },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {children}
    </Box>
  );
}
