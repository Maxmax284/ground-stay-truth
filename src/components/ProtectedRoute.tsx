import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute, permissions } from "@/lib/permissions";
import { useTranslation } from "react-i18next";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPath?: string;
  guestOnly?: boolean;
}

const ProtectedRoute = ({ children, requiredPath, guestOnly = false }: ProtectedRouteProps) => {
  const { t } = useTranslation();
  const { user, loading, role } = useAuth();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Wait for role to resolve after authentication before making role-based decisions
  if (user && role === null && !guestOnly) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (requiredPath && role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  if (guestOnly && permissions.isStaff(role)) {
    // Allow admins to preview the guest portal
    if (isPreview && role === "admin") {
      return <>{children}</>;
    }
    return <Navigate to="/" replace />;
  }

  if (guestOnly && role === "guest") {
    return <>{children}</>;
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-md px-6">
          <h2 className="text-xl font-semibold text-foreground">{t("protectedRoute.pendingAccess")}</h2>
          <p className="text-muted-foreground">{t("protectedRoute.pendingDesc")}</p>
        </div>
      </div>
    );
  }

  if (requiredPath && !canAccessRoute(role, requiredPath)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{t("protectedRoute.accessRestricted")}</h2>
          <p className="text-muted-foreground">{t("protectedRoute.noPermission")}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
