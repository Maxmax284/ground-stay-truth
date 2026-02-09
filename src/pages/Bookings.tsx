import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Bookings = () => (
  <DashboardLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
        <p className="text-muted-foreground mt-1">Manage reservations and booking states</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Coming Soon</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Booking management with the full state machine, filters, and audit log will be available here.
          </p>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default Bookings;
