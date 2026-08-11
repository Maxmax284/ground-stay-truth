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
import { MfaBackupCodesCard } from "@/components/security/MfaBackupCodesCard";
import { MfaAdminResetCard } from "@/components/security/MfaAdminResetCard";
import { PaymentLinkAbuseCard } from "@/components/security/PaymentLinkAbuseCard";
import { AIUsageDashboard } from "@/components/security/AIUsageDashboard";
import { ComplianceCenter } from "@/components/security/ComplianceCenter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";

export default function SecurityCenter() {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" data-ai-focus="security">
        <header className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Security Center</h1>
        </header>
        <p className="text-sm text-muted-foreground">
          Security posture, MFA enforcement, audit trail, and compliance tools
          in one place.
        </p>

        <Tabs defaultValue="security" className="w-full">
          <TabsList>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="space-y-4 mt-4">
            <SecurityCenterOverview />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StaffMfaCard />
              <MfaBackupCodesCard />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MfaAdminResetCard />
              <WebhookHealthCard />
            </div>
            <DeviceRecognitionCard />
            <TrustedDevicesCard />
            <PaymentLinkAbuseCard />
            <AIUsageDashboard />
            <MfaPolicyForm />
            <SecurityDashboard />
          </TabsContent>

          <TabsContent value="compliance" className="mt-4">
            <ComplianceCenter />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
