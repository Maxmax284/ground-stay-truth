import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Reports = () => (
  <DashboardLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground mt-1">Occupancy, revenue, and availability insights</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Coming Soon</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Occupancy rates, revenue per unit, and blocked vs. bookable time breakdowns will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default Reports;
