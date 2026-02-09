import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute } from "@/lib/permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Legacy prop — still supported but route access is now role-driven */
  requireAdmin?: boolean;
}

const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { user, loading, role, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

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
