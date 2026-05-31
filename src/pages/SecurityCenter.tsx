/**
 * Security Center — admin-only.
 * Foundation page for staff MFA, role/permission audit, sensitive-action
 * protection, and security visibility.
 */
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { SecurityCenterOverview } from "@/components/security/SecurityCenterOverview";
import { MfaPolicyForm } from "@/components/security/MfaPolicyForm";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { WebhookHealthCard } from "@/components/WebhookHealthCard";
import { StaffMfaCard } from "@/components/security/StaffMfaCard";
import { PaymentLinkAbuseCard } from "@/components/security/PaymentLinkAbuseCard";
import { ShieldCheck } from "lucide-react";

export default function SecurityCenter() {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <header className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Security Center</h1>
        </header>
        <p className="text-sm text-muted-foreground">
          Configure MFA enforcement, monitor staff coverage, and review the audit trail
          for sensitive actions. Does not modify the payment launch flow.
        </p>

        <SecurityCenterOverview />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StaffMfaCard />
          <WebhookHealthCard />
        </div>

        <PaymentLinkAbuseCard />

        <MfaPolicyForm />

        <StaffAuditLog />
        <SecurityEventLog />
      </div>
    </DashboardLayout>
  );
}
