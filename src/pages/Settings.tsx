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
import PropertyAssignmentManager from "@/components/PropertyAssignmentManager";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";

const Settings = () => {
  const { t } = useTranslation();
  const { role } = useAuth();

  const canManageRoles = permissions.canManageRoles(role);
  const canManagePolicies = permissions.canManagePolicies(role);
  const canManageReviews = permissions.canManageReviews(role);
  const isAdmin = role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile">{t("settings.profileTab")}</TabsTrigger>
            {canManageRoles && <TabsTrigger value="users">{t("settings.usersTab")}</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="cancellation">Cancellation</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="policies">{t("settings.policiesTab")}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="drivers">Drivers</TabsTrigger>}
            {isAdmin && <TabsTrigger value="properties">Properties</TabsTrigger>}
            {isAdmin && <TabsTrigger value="training">Training</TabsTrigger>}
            {isAdmin && <TabsTrigger value="arrival">Arrival Welcome</TabsTrigger>}
            {isAdmin && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
            {canManageReviews && <TabsTrigger value="reviews">{t("settings.reviewsTab")}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="security">Security</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile"><ProfileEditor /></TabsContent>
          {canManageRoles && <TabsContent value="users"><UserRoleManager /></TabsContent>}
          {canManagePolicies && <TabsContent value="cancellation"><CancellationPolicyEditor /></TabsContent>}
          {canManagePolicies && <TabsContent value="policies"><PolicySettingsForm /></TabsContent>}
          {isAdmin && <TabsContent value="drivers"><DriverManager /></TabsContent>}
          {isAdmin && <TabsContent value="properties"><PropertyAssignmentManager /></TabsContent>}
          {isAdmin && <TabsContent value="training"><TrainingPackagesManager /></TabsContent>}
          {isAdmin && <TabsContent value="arrival"><ArrivalWelcomeEditor /></TabsContent>}
          {isAdmin && <TabsContent value="integrations"><IntegrationSettings /></TabsContent>}
          {canManageReviews && <TabsContent value="reviews"><ReviewsManager /></TabsContent>}
          {isAdmin && <TabsContent value="security"><SecurityEventLog /></TabsContent>}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
