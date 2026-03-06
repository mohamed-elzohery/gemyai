import { Navigate, Outlet } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "../contexts/AuthContext";

/**
 * Route wrapper that requires authentication.
 * - While the session check is in-flight → full-screen spinner.
 * - If not logged in → redirect to the public home page.
 * - Otherwise → render the child route via <Outlet />.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
