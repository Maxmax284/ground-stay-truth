import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileEditor from "@/components/ProfileEditor";
import UserRoleManager from "@/components/UserRoleManager";
import { PolicySettingsForm } from "@/components/PolicySettingsForm";
import { EmbedCodeGenerator } from "@/components/EmbedCodeGenerator";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";

const Settings = () => {
  const { t } = useTranslation();
  const { role } = useAuth();

  const canManageRoles = permissions.canManageRoles(role);
  const canManagePolicies = permissions.canManagePolicies(role);
  const canManageUnits = permissions.canManageUnits(role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">{t("settings.profileTab")}</TabsTrigger>
            {canManageRoles && <TabsTrigger value="users">{t("settings.usersTab")}</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="policies">{t("settings.policiesTab")}</TabsTrigger>}
            {canManageUnits && <TabsTrigger value="embeds">{t("settings.embedsTab")}</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile"><ProfileEditor /></TabsContent>
          {canManageRoles && <TabsContent value="users"><UserRoleManager /></TabsContent>}
          {canManagePolicies && <TabsContent value="policies"><PolicySettingsForm /></TabsContent>}
          {canManageUnits && <TabsContent value="embeds"><EmbedCodeGenerator /></TabsContent>}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
