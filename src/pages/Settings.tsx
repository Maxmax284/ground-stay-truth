import { useTranslation } from "react-i18next";
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
import { ArrivalWelcomeEditor } from "@/components/ArrivalWelcomeEditor";
import { SecurityEventLog } from "@/components/SecurityEventLog";
import { IntelligenceEditor } from "@/components/IntelligenceEditor";
import PropertyManagementPanel from "@/components/PropertyManagementPanel";
import { VantaIntegrationPanel } from "@/components/VantaIntegrationPanel";
import NotificationSettings from "@/components/settings/NotificationSettings";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";


const Settings = () => {
  const { t } = useTranslation();
  const { role } = useAuth();

  const canManageRoles = permissions.canManageRoles(role);
  const canManagePolicies = permissions.canManagePolicies(role);
  const canManageReviews = permissions.canManageReviews(role);
  const isAdmin = role === "admin";
  const canSeeNotifications = isAdmin || role === "manager";


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1.5 bg-muted/80 relative z-10">
            <TabsTrigger value="profile" className="text-xs sm:text-sm">{t("settings.profileTab")}</TabsTrigger>
            {canManageRoles && <TabsTrigger value="users" className="text-xs sm:text-sm">{t("settings.usersTab")}</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="cancellation" className="text-xs sm:text-sm">Cancellation</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="policies" className="text-xs sm:text-sm">{t("settings.policiesTab")}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="drivers" className="text-xs sm:text-sm">Drivers</TabsTrigger>}
            {isAdmin && <TabsTrigger value="properties" className="text-xs sm:text-sm">Properties</TabsTrigger>}
            {isAdmin && <TabsTrigger value="training" className="text-xs sm:text-sm">Training</TabsTrigger>}
            {isAdmin && <TabsTrigger value="arrival" className="text-xs sm:text-sm">Arrival</TabsTrigger>}
            {isAdmin && <TabsTrigger value="integrations" className="text-xs sm:text-sm">Integrations</TabsTrigger>}
            {canManageReviews && <TabsTrigger value="reviews" className="text-xs sm:text-sm">{t("settings.reviewsTab")}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="security" className="text-xs sm:text-sm">Security</TabsTrigger>}
            {isAdmin && <TabsTrigger value="intelligence" className="text-xs sm:text-sm">Intel</TabsTrigger>}
            {isAdmin && <TabsTrigger value="vanta" className="text-xs sm:text-sm">Vanta</TabsTrigger>}
            {canSeeNotifications && <TabsTrigger value="notifications" className="text-xs sm:text-sm">Notifications</TabsTrigger>}
          </TabsList>


          <TabsContent value="profile"><ProfileEditor /></TabsContent>
          {canManageRoles && <TabsContent value="users"><UserRoleManager /></TabsContent>}
          {canManagePolicies && <TabsContent value="cancellation"><CancellationPolicyEditor /></TabsContent>}
          {canManagePolicies && <TabsContent value="policies"><PolicySettingsForm /></TabsContent>}
          {isAdmin && <TabsContent value="drivers"><DriverManager /></TabsContent>}
          {isAdmin && <TabsContent value="properties"><PropertyManagementPanel /></TabsContent>}
          {isAdmin && <TabsContent value="training"><TrainingPackagesManager /></TabsContent>}
          {isAdmin && <TabsContent value="arrival"><ArrivalWelcomeEditor /></TabsContent>}
          {isAdmin && <TabsContent value="integrations"><IntegrationSettings /></TabsContent>}
          {canManageReviews && <TabsContent value="reviews"><ReviewsManager /></TabsContent>}
          {isAdmin && <TabsContent value="security"><SecurityEventLog /></TabsContent>}
          {isAdmin && <TabsContent value="intelligence"><IntelligenceEditor /></TabsContent>}
          {isAdmin && <TabsContent value="vanta"><VantaIntegrationPanel /></TabsContent>}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
