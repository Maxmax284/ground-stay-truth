import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute, permissions } from "@/lib/permissions";
import { useTranslation } from "react-i18next";
import MfaGate from "@/components/security/MfaGate";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPath?: string;
  guestOnly?: boolean;
}

const ProtectedRoute = ({ children, requiredPath, guestOnly = false }: ProtectedRouteProps) => {
  const { t } = useTranslation();
  const { user, loading, role, roleResolved } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);
  const isPreview = searchParams.get("preview") === "true";

  useEffect(() => {
    if (loading || !user || roleResolved) {
      setTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [loading, user, roleResolved]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) {
    const target = guestOnly ? `/auth/guest${location.search}` : "/auth";
    return <Navigate to={target} replace />;
  }

  if (user && !roleResolved && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user && !roleResolved && timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center space-y-3 max-w-md">
          <h2 className="text-xl font-semibold text-foreground">Still checking your access</h2>
          <p className="text-muted-foreground">Please refresh or sign in again from the Staff Login page.</p>
          <a href="/auth" className="text-sm font-medium text-primary hover:underline">Go to Staff Login</a>
        </div>
      </div>
    );
  }

  if (requiredPath && role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  if (guestOnly && permissions.isStaff(role)) {
    // Allow admins to preview the guest portal
    if (isPreview && (role === "admin" || role === "manager")) {
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
          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-primary hover:underline"
            >
              Refresh
            </button>
            <a href="/auth/guest" className="text-sm font-medium text-primary hover:underline">
              Sign in again
            </a>
          </div>
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

  // High-privilege roles must satisfy MFA before any staff surface mounts.
  return <MfaGate>{children}</MfaGate>;
};

export default ProtectedRoute;
