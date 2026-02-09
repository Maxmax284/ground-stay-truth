import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Settings = () => (
  <DashboardLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">System configuration and preferences</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Coming Soon</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Policy defaults, user management, and system preferences will be configurable here.
          </p>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default Settings;
