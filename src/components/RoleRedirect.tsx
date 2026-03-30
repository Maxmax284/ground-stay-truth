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
  const { role, loading, user } = useAuth();

  // Wait for both auth AND role to be resolved before redirecting
  // When user just logged in, role may still be null briefly while fetchRole runs
  if (loading || (user && role === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  // Staff or genuinely no role assigned
  return <Navigate to="/dashboard" replace />;
};

export default RoleRedirect;
