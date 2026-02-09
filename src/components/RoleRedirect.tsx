import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";

/**
 * Redirects users to the correct home page based on their role.
 * - Staff → /dashboard
 * - Guest → /guest
 * - No role yet (loading/new user) → /dashboard (will be caught by ProtectedRoute)
 */
const RoleRedirect = () => {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  // Staff or no role assigned yet
  return <Navigate to="/dashboard" replace />;
};

export default RoleRedirect;
