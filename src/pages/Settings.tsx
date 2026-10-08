import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileEditor from "@/components/ProfileEditor";
import UserRoleManager from "@/components/UserRoleManager";
import { PolicySettingsForm } from "@/components/PolicySettingsForm";
import { CancellationPolicyEditor } from "@/components/CancellationPolicyEditor";
import { ReviewsManager } from "@/components/ReviewsManager";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { TrainingPackagesManager } from "@/components/TrainingPackagesManager";
import { DriverManager } from "@/components/DriverManager";
import { SecurityEventLog } from "@/components/SecurityEventLog";
import { IntelligenceEditor } from "@/components/IntelligenceEditor";
import PropertyManagementPanel from "@/components/PropertyManagementPanel";
import { VantaIntegrationPanel } from "@/components/VantaIntegrationPanel";
import NotificationSettings from "@/components/settings/NotificationSettings";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { AppStatusPanel } from "@/components/settings/AppStatusPanel";
import { AssistanceSettingsCard } from "@/components/settings/AssistanceSettingsCard";
import { CommsHealthCard } from "@/components/settings/CommsHealthCard";
import { SandboxPanel } from "@/components/SandboxPanel";
import { AIOpsPanel } from "@/components/admin/AIOpsPanel";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Phone } from "lucide-react";
import StaffPhoneManager from "@/components/settings/StaffPhoneManager";
import { GuestGuideSettings } from "@/components/settings/GuestGuideSettings";



const Settings = () => {
  const { t } = useTranslation();
  const { role } = useAuth();

  const canManageRoles = permissions.canManageRoles(role);
  const canManagePolicies = permissions.canManagePolicies(role);
  const canManageReviews = permissions.canManageReviews(role);
  const isAdmin = role === "admin";
  const canSeeNotifications = isAdmin || role === "manager";

  // Keep the open tab in the URL so re-renders never bounce back to Profile.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const setActiveTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1.5 bg-muted/80 relative z-10">
            <TabsTrigger value="profile" className="text-xs sm:text-sm">{t("settings.profileTab")}</TabsTrigger>
            {canManageRoles && <TabsTrigger value="users" className="text-xs sm:text-sm">{t("settings.usersTab")}</TabsTrigger>}
            <TabsTrigger value="staff-phones" className="text-xs sm:text-sm">
              <Phone className="h-3.5 w-3.5 mr-1" />Staff Phones
            </TabsTrigger>
            {canManagePolicies && <TabsTrigger value="cancellation" className="text-xs sm:text-sm">Cancellation</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="policies" className="text-xs sm:text-sm">{t("settings.policiesTab")}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="drivers" className="text-xs sm:text-sm">Drivers</TabsTrigger>}
            {isAdmin && <TabsTrigger value="properties" className="text-xs sm:text-sm">Properties</TabsTrigger>}
            {isAdmin && <TabsTrigger value="training" className="text-xs sm:text-sm">Training</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="guest-guide" className="text-xs sm:text-sm">Guest Guide &amp; Welcome</TabsTrigger>}
            {isAdmin && <TabsTrigger value="integrations" className="text-xs sm:text-sm">Integrations</TabsTrigger>}
            {canManageReviews && <TabsTrigger value="reviews" className="text-xs sm:text-sm">{t("settings.reviewsTab")}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="aiops" className="text-xs sm:text-sm">Ops</TabsTrigger>}
            {isAdmin && <TabsTrigger value="security" className="text-xs sm:text-sm">Security</TabsTrigger>}
            {isAdmin && <TabsTrigger value="intelligence" className="text-xs sm:text-sm">Intel</TabsTrigger>}
            {isAdmin && <TabsTrigger value="vanta" className="text-xs sm:text-sm">Vanta</TabsTrigger>}
            {canSeeNotifications && <TabsTrigger value="notifications" className="text-xs sm:text-sm">Notifications</TabsTrigger>}
            {canSeeNotifications && <TabsTrigger value="sandbox" className="text-xs sm:text-sm">Sandbox</TabsTrigger>}
            <TabsTrigger value="app" className="text-xs sm:text-sm">App</TabsTrigger>
          </TabsList>


          {/* Every panel is isolated: one crashing section must never blank the page. */}
          <TabsContent value="profile" className="space-y-4"><ErrorBoundary inline label="Profile"><ProfileEditor /></ErrorBoundary><ErrorBoundary inline label="Ops alerts"><PushNotificationToggle title="Ops Alerts" /></ErrorBoundary></TabsContent>
          {canManageRoles && <TabsContent value="users"><ErrorBoundary inline label="Users"><UserRoleManager /></ErrorBoundary></TabsContent>}
          <TabsContent value="staff-phones"><ErrorBoundary inline label="Staff phones"><StaffPhoneManager /></ErrorBoundary></TabsContent>
          {canManagePolicies && <TabsContent value="cancellation"><ErrorBoundary inline label="Cancellation policy"><CancellationPolicyEditor /></ErrorBoundary></TabsContent>}
          {canManagePolicies && <TabsContent value="policies"><ErrorBoundary inline label="Policies"><PolicySettingsForm /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="drivers"><ErrorBoundary inline label="Drivers"><DriverManager /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="properties"><ErrorBoundary inline label="Properties"><PropertyManagementPanel /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="training"><ErrorBoundary inline label="Training"><TrainingPackagesManager /></ErrorBoundary></TabsContent>}
          {canManagePolicies && <TabsContent value="guest-guide"><ErrorBoundary inline label="Guest guide"><GuestGuideSettings isAdmin={isAdmin} /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="integrations"><ErrorBoundary inline label="Integrations"><IntegrationSettings /></ErrorBoundary></TabsContent>}
          {canManageReviews && <TabsContent value="reviews"><ErrorBoundary inline label="Reviews"><ReviewsManager /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="aiops"><ErrorBoundary inline label="Ops"><AIOpsPanel /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="security"><ErrorBoundary inline label="Security"><SecurityEventLog /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="intelligence"><ErrorBoundary inline label="Intel"><IntelligenceEditor /></ErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="vanta"><ErrorBoundary inline label="Vanta"><VantaIntegrationPanel /></ErrorBoundary></TabsContent>}
          {canSeeNotifications && <TabsContent value="notifications"><ErrorBoundary inline label="Notifications"><NotificationSettings /></ErrorBoundary></TabsContent>}
          {canSeeNotifications && <TabsContent value="sandbox"><ErrorBoundary inline label="Sandbox"><SandboxPanel /></ErrorBoundary></TabsContent>}
          <TabsContent value="app" className="space-y-4">
            {(isAdmin || role === "manager") && <ErrorBoundary inline label="Guest contact & emergency"><AssistanceSettingsCard /></ErrorBoundary>}
            <ErrorBoundary inline label="App status"><AppStatusPanel /></ErrorBoundary>
            {isAdmin && <ErrorBoundary inline label="Message delivery"><CommsHealthCard /></ErrorBoundary>}
          </TabsContent>

        </Tabs>

      </div>
    </DashboardLayout>
  );
};

export default Settings;
