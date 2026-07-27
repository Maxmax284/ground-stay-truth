import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { StripeConnectionStatus } from "@/components/StripeConnectionStatus";
import { StripeWebhookWizard } from "@/components/StripeWebhookWizard";
import { useAuth } from "@/hooks/useAuth";

/**
 * /stripe-setup — deliberate escape hatch.
 *
 * Settings is a big page with a dozen panels. If any one of them breaks, an
 * admin must still be able to install the Stripe webhook signing secret and
 * prove the handshake. This route mounts only the Stripe panels.
 */
const StripeSetup = () => {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stripe Setup</h1>
          <p className="text-muted-foreground mt-1">
            Direct access to the Stripe webhook signing secret and handshake test. Use this if{" "}
            <Link to="/settings" className="underline">Settings → Integrations</Link> won't load.
          </p>
        </div>

        {!isAdmin ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            Admin access required to view or change Stripe configuration.
          </div>
        ) : (
          <>
            <ErrorBoundary inline label="Stripe connection">
              <StripeConnectionStatus />
            </ErrorBoundary>
            <ErrorBoundary inline label="Webhook setup wizard">
              <StripeWebhookWizard />
            </ErrorBoundary>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default StripeSetup;
