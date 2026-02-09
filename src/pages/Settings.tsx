import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileEditor from "@/components/ProfileEditor";
import UserRoleManager from "@/components/UserRoleManager";
import { PolicySettingsForm } from "@/components/PolicySettingsForm";
import { useAuth } from "@/hooks/useAuth";

const Settings = () => {
  const { isAdmin } = useAuth();

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
            {isAdmin && <TabsTrigger value="users">Users & Roles</TabsTrigger>}
            {isAdmin && <TabsTrigger value="policies">Policies</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile">
            <ProfileEditor />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="users">
              <UserRoleManager />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="policies">
              <PolicySettingsForm />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
