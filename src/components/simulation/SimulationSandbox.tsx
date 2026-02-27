import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSimulation } from "./SimulationContext";
import { cn } from "@/lib/utils";

const STATE_COLORS: Record<string, string> = {
  inquiry: "bg-muted text-muted-foreground",
  soft_hold: "bg-warning/15 text-warning-foreground",
  pending_approval: "bg-info/15 text-info-foreground",
  pending_deposit: "bg-accent text-accent-foreground",
  confirmed: "bg-success/15 text-success",
  checked_in: "bg-primary/15 text-primary",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
};

export function SimulationSandbox() {
  const { data, simulatedRole, transitionBooking } = useSimulation();

  return (
    <div className="space-y-6">
      {/* Units Overview */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Mock Units ({data.units.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.units.map((unit) => {
            const unitBookings = data.bookings.filter((b) => b.unit_id === unit.id && !["completed", "cancelled", "no_show"].includes(b.state));
            return (
              <Card key={unit.id} className="hover-lift">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{unit.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{unit.capacity} guests · ฿{unit.base_price}/night</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {unitBookings.map((b) => (
                      <Badge key={b.id} variant="outline" className="text-[9px]">
                        {b.state.replace("_", " ")}
                      </Badge>
                    ))}
                    {unitBookings.length === 0 && (
                      <span className="text-xs text-muted-foreground">No active bookings</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bookings Grid */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Mock Bookings ({data.bookings.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.bookings.map((booking) => {
            const unit = data.units.find((u) => u.id === booking.unit_id);
            return (
              <Card key={booking.id} className="hover-lift">
                <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-sm">{booking.guest_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{unit?.name || "Unknown"}</p>
                  </div>
                  <Badge className={cn("text-[10px]", STATE_COLORS[booking.state])}>
                    {booking.state.replace("_", " ")}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {booking.check_in} → {booking.check_out} · {booking.num_guests} guest(s)
                  </div>
                  {booking.total_price && (
                    <div className="text-xs font-medium">฿{booking.total_price.toLocaleString()}</div>
                  )}
                  {booking.notes && (
                    <p className="text-xs text-muted-foreground italic truncate">{booking.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Maintenance & Laundry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Maintenance ({data.maintenanceRequests.length})
          </h3>
          <div className="space-y-2">
            {data.maintenanceRequests.map((req) => (
              <Card key={req.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{req.description}</p>
                    <p className="text-xs text-muted-foreground">{req.category} · {req.priority} priority</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{req.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Laundry ({data.laundryRequests.length})
          </h3>
          <div className="space-y-2">
            {data.laundryRequests.map((req) => (
              <Card key={req.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{req.bag_count} bag(s)</p>
                    <p className="text-xs text-muted-foreground">{req.note || "No notes"}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{req.status.replace("_", " ")}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
