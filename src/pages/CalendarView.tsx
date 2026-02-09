import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CalendarView = () => (
  <DashboardLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
        <p className="text-muted-foreground mt-1">Visual overview of availability across all units</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Coming Soon</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A visual calendar with color-coded booking states, cleaning buffers, and click-to-book will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default CalendarView;
