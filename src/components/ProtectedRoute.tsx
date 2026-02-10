import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute, permissions } from "@/lib/permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Path to check against the role-based NAV_ACCESS map */
  requiredPath?: string;
  /** If true, this route is only accessible to guests */
  guestOnly?: boolean;
}

const ProtectedRoute = ({ children, requiredPath, guestOnly = false }: ProtectedRouteProps) => {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Guest trying to access staff routes → redirect to guest portal
  if (requiredPath && role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  // Staff trying to access guest-only routes → redirect to dashboard
  if (guestOnly && permissions.isStaff(role)) {
    return <Navigate to="/" replace />;
  }

  // Guest-only route for actual guests
  if (guestOnly && role === "guest") {
    return <>{children}</>;
  }

  // Authenticated but no role assigned → "Pending Access" screen
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-md px-6">
          <h2 className="text-xl font-semibold text-foreground">Pending Access</h2>
          <p className="text-muted-foreground">
            Your account is active but hasn't been assigned a role yet. Please contact your administrator to get access.
          </p>
        </div>
      </div>
    );
  }

  // Check granular route permission
  if (requiredPath && !canAccessRoute(role, requiredPath)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Access restricted</h2>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
