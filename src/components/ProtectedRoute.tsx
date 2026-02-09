import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  /** If true, this route is only accessible to guests */
  guestOnly?: boolean;
  /** If true, this route is only accessible to staff (non-guest roles) */
  staffOnly?: boolean;
}

const ProtectedRoute = ({ children, requireAdmin = false, guestOnly = false, staffOnly = false }: ProtectedRouteProps) => {
  const { user, loading, role, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Guest trying to access staff routes → redirect to guest portal
  if (staffOnly && role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  // Staff trying to access guest-only routes → redirect to dashboard
  if (guestOnly && permissions.isStaff(role)) {
    return <Navigate to="/" replace />;
  }

  // Legacy requireAdmin check
  if (requireAdmin && !isAdmin) {
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
