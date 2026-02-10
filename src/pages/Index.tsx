import { Link } from "react-router-dom";
import { Building2, BookOpen, CalendarDays, TrendingUp, ArrowRight, Plus, LogIn, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardStats } from "@/hooks/useDashboard";
import { type BookingState } from "@/lib/bookingStateMachine";
import { canAccessRoute } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const Index = () => {
  const { t } = useTranslation();
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
          <h1 className="text-2xl font-bold text-foreground">{t("dashboard.welcome")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.overview")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("dashboard.todaysArrivals")}
            value={isLoading ? null : String(arrivalsCount)}
            icon={LogIn}
            description={t("dashboard.checkInsToday", { count: arrivalsCount })}
          />
          <StatCard
            label={t("dashboard.todaysDepartures")}
            value={isLoading ? null : String(departuresCount)}
            icon={LogOut}
            description={t("dashboard.checkOutsToday", { count: departuresCount })}
          />
          <StatCard
            label={t("dashboard.activeBookings")}
            value={isLoading ? null : String(activeCount)}
            icon={BookOpen}
            description={t("dashboard.acrossAllUnits")}
          />
          <StatCard
            label={t("dashboard.activeUnits")}
            value={isLoading ? null : String(units)}
            icon={Building2}
            description={t("dashboard.unitsConfigured", { count: units })}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("dashboard.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canAccessRoute(role, "/bookings") && (
                <QuickAction to="/bookings" icon={Plus} label={t("dashboard.newBooking")} description={t("dashboard.createReservation")} />
              )}
              {canAccessRoute(role, "/calendar") && (
                <QuickAction to="/calendar" icon={CalendarDays} label={t("dashboard.viewCalendar")} description={t("dashboard.seeAvailability")} />
              )}
              {canAccessRoute(role, "/units") && (
                <QuickAction to="/units" icon={Building2} label={t("dashboard.manageUnits")} description={t("dashboard.addOrEditUnits")} />
              )}
              {canAccessRoute(role, "/pricing") && (
                <QuickAction to="/pricing" icon={TrendingUp} label={t("dashboard.pricingPolicies")} description={t("dashboard.configureRates")} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t("dashboard.recentActivity")}</CardTitle>
              <Link to="/bookings">
                <Button variant="ghost" size="sm" className="text-xs">
                  {t("common.viewAll")} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentActivity.isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !recentActivity.data?.length ? (
                <p className="text-sm text-muted-foreground">{t("dashboard.noRecentActivity")}</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.data.map((log: any) => {
                    const unitName = log.bookings?.units?.name ?? t("common.unknown");
                    const fromLabel = log.from_state ? t(`states.${log.from_state}`) : null;
                    const toLabel = t(`states.${log.to_state}`);

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
                              <span>{t("dashboard.createdAs", { state: toLabel })}</span>
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

          {arrivalsCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-success" /> {t("dashboard.arrivingToday")}
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
                    <Badge variant="outline">{t("bookings.guestCount", { count: b.num_guests })}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {departuresCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LogOut className="h-5 w-5 text-warning" /> {t("dashboard.departingToday")}
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
                    <Badge variant="outline">{t("bookings.guestCount", { count: b.num_guests })}</Badge>
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
