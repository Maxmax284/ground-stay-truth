import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Pricing = () => (
  <DashboardLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pricing & Policies</h1>
        <p className="text-muted-foreground mt-1">Configure pricing rules and operational policies</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Coming Soon</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Per-unit pricing, seasonal rules, and policy configuration will be managed here.
          </p>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default Pricing;
