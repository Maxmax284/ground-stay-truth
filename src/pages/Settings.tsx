import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileEditor from "@/components/ProfileEditor";
import UserRoleManager from "@/components/UserRoleManager";
import { PolicySettingsForm } from "@/components/PolicySettingsForm";
import { EmbedCodeGenerator } from "@/components/EmbedCodeGenerator";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";

const Settings = () => {
  const { role } = useAuth();

  const canManageRoles = permissions.canManageRoles(role);
  const canManagePolicies = permissions.canManagePolicies(role);
  const canManageUnits = permissions.canManageUnits(role); // Manager+ can see embeds

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your profile, users, and system configuration</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {canManageRoles && <TabsTrigger value="users">Users & Roles</TabsTrigger>}
            {canManagePolicies && <TabsTrigger value="policies">Policies</TabsTrigger>}
            {canManageUnits && <TabsTrigger value="embeds">Embeds</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile">
            <ProfileEditor />
          </TabsContent>

          {canManageRoles && (
            <TabsContent value="users">
              <UserRoleManager />
            </TabsContent>
          )}

          {canManagePolicies && (
            <TabsContent value="policies">
              <PolicySettingsForm />
            </TabsContent>
          )}

          {canManageUnits && (
            <TabsContent value="embeds">
              <EmbedCodeGenerator />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
