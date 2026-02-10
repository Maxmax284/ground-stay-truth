import { Link } from "react-router-dom";
import { Building2, BookOpen, CalendarDays, TrendingUp, ArrowRight, Plus, LogIn, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardStats } from "@/hooks/useDashboard";
import { STATE_LABELS, type BookingState } from "@/lib/bookingStateMachine";
import { canAccessRoute } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const Index = () => {
  const { role } = useAuth();
  const { arrivals, departures, activeBookings, unitCount, recentActivity } = useDashboardStats();

  const arrivalsCount = arrivals.data?.length ?? 0;
  const departuresCount = departures.data?.length ?? 0;
  const activeCount = activeBookings.data ?? 0;
  const units = unitCount.data ?? 0;
  const isLoading = arrivals.isLoading || departures.isLoading || activeBookings.isLoading || unitCount.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Ground Stay</h1>
          <p className="text-muted-foreground mt-1">Here's an overview of your property today.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Today's Arrivals"
            value={isLoading ? null : String(arrivalsCount)}
            icon={LogIn}
            description={arrivalsCount === 1 ? "1 check-in today" : `${arrivalsCount} check-ins today`}
          />
          <StatCard
            label="Today's Departures"
            value={isLoading ? null : String(departuresCount)}
            icon={LogOut}
            description={departuresCount === 1 ? "1 check-out today" : `${departuresCount} check-outs today`}
          />
          <StatCard
            label="Active Bookings"
            value={isLoading ? null : String(activeCount)}
            icon={BookOpen}
            description="Across all units"
          />
          <StatCard
            label="Active Units"
            value={isLoading ? null : String(units)}
            icon={Building2}
            description={units === 1 ? "1 unit configured" : `${units} units configured`}
          />
        </div>

        {/* Quick actions + recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canAccessRoute(role, "/bookings") && (
                <QuickAction to="/bookings" icon={Plus} label="New Booking" description="Create a new reservation" />
              )}
              {canAccessRoute(role, "/calendar") && (
                <QuickAction to="/calendar" icon={CalendarDays} label="View Calendar" description="See availability at a glance" />
              )}
              {canAccessRoute(role, "/units") && (
                <QuickAction to="/units" icon={Building2} label="Manage Units" description="Add or edit accommodation units" />
              )}
              {canAccessRoute(role, "/pricing") && (
                <QuickAction to="/pricing" icon={TrendingUp} label="Pricing & Policies" description="Configure rates and rules" />
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <Link to="/bookings">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentActivity.isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !recentActivity.data?.length ? (
                <p className="text-sm text-muted-foreground">
                  No recent activity yet. Your audit log will appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.data.map((log: any) => {
                    const unitName = log.bookings?.units?.name ?? "Unknown";
                    const fromLabel = log.from_state ? STATE_LABELS[log.from_state as BookingState] : null;
                    const toLabel = STATE_LABELS[log.to_state as BookingState];

                    return (
                      <div key={log.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground">
                            <span className="font-medium">{unitName}</span>
                            {" — "}
                            {fromLabel ? (
                              <span>{fromLabel} → {toLabel}</span>
                            ) : (
                              <span>Created as {toLabel}</span>
                            )}
                          </p>
                          {log.reason && (
                            <p className="text-xs text-muted-foreground truncate">{log.reason}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's arrivals detail */}
          {arrivalsCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-success" /> Arriving Today
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {arrivals.data?.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between text-sm border rounded-md p-3">
                    <div>
                      <span className="font-medium">{b.units?.name ?? "—"}</span>
                      {b.profiles?.full_name && (
                        <span className="text-muted-foreground ml-2">· {b.profiles.full_name}</span>
                      )}
                    </div>
                    <Badge variant="outline">{b.num_guests} guest{b.num_guests !== 1 ? "s" : ""}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Today's departures detail */}
          {departuresCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LogOut className="h-5 w-5 text-warning" /> Departing Today
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {departures.data?.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between text-sm border rounded-md p-3">
                    <div>
                      <span className="font-medium">{b.units?.name ?? "—"}</span>
                      {b.profiles?.full_name && (
                        <span className="text-muted-foreground ml-2">· {b.profiles.full_name}</span>
                      )}
                    </div>
                    <Badge variant="outline">{b.num_guests} guest{b.num_guests !== 1 ? "s" : ""}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

function StatCard({ label, value, icon: Icon, description }: {
  label: string; value: string | null; icon: any; description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground" style={{ fontFamily: "'Source Sans 3', sans-serif" }}>
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, icon: Icon, label, description }: {
  to: string; icon: any; label: string; description: string;
}) {
  return (
    <Link to={to}>
      <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
      </div>
    </Link>
  );
}

export default Index;
