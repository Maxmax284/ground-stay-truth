import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Redirects users to the correct home page based on their role.
 * - Staff → /dashboard
 * - Guest → /guest
 */
const RoleRedirect = () => {
  const { role, loading, user, roleResolved } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loading || !user || roleResolved) {
      setTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setTimedOut(true), 7000);
    return () => window.clearTimeout(timer);
  }, [loading, user, roleResolved]);

  if (loading || (user && !roleResolved && !timedOut)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user && !roleResolved && timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Still checking your access</h2>
          <p className="text-sm text-muted-foreground">
            This is taking longer than expected. Please refresh, or sign in again from the Staff Login page.
          </p>
          <a href="/auth" className="text-sm font-medium text-primary hover:underline">Go to Staff Login</a>
        </div>
      </div>
    );
  }

  if (role === "guest") {
    return <Navigate to="/guest" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};

export default RoleRedirect;
