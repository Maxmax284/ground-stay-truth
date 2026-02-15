import { Link } from "react-router-dom";
import { Building2, BookOpen, CalendarDays, TrendingUp, ArrowRight, Plus, LogIn, LogOut, Wrench, Shirt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardStats } from "@/hooks/useDashboard";
import { type BookingState } from "@/lib/bookingStateMachine";
import { canAccessRoute, permissions } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { MaintenanceQueue } from "@/components/MaintenanceQueue";
import { LaundryPanel } from "@/components/LaundryPanel";
import { useOpenMaintenanceCount } from "@/hooks/useMaintenanceRequests";
import { useCountUp } from "@/hooks/useCountUp";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const Index = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { arrivals, departures, activeBookings, unitCount, recentActivity, pendingApproval } = useDashboardStats();

  const arrivalsCount = arrivals.data?.length ?? 0;
  const departuresCount = departures.data?.length ?? 0;
  const activeCount = activeBookings.data ?? 0;
  const units = unitCount.data ?? 0;
  const isLoading = arrivals.isLoading || departures.isLoading || activeBookings.isLoading || unitCount.isLoading;

  const canApprove = permissions.canApproveBooking(role);
  const isMaintenance = role === "maintenance";
  const isViewer = role === "viewer";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("dashboard.welcome")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.overview")}</p>
        </div>

        {/* Maintenance role: simplified view */}
        {isMaintenance ? (
          <MaintenanceDashboard t={t} />
        ) : (
          <>
            {/* Stats Row — visible to all non-maintenance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={t("dashboard.todaysArrivals")}
                value={isLoading ? null : arrivalsCount}
                icon={LogIn}
                description={t("dashboard.checkInsToday", { count: arrivalsCount })}
                stagger={1}
              />
              <StatCard
                label={t("dashboard.todaysDepartures")}
                value={isLoading ? null : departuresCount}
                icon={LogOut}
                description={t("dashboard.checkOutsToday", { count: departuresCount })}
                stagger={2}
              />
              <StatCard
                label={t("dashboard.activeBookings")}
                value={isLoading ? null : activeCount}
                icon={BookOpen}
                description={t("dashboard.acrossAllUnits")}
                stagger={3}
              />
              <StatCard
                label={t("dashboard.activeUnits")}
                value={isLoading ? null : units}
                icon={Building2}
                description={t("dashboard.unitsConfigured", { count: units })}
                stagger={4}
              />
            </div>

            {/* Admin/Manager layout: Approval queue prominent */}
            {canApprove && (
              <ApprovalQueue bookings={pendingApproval.data} isLoading={pendingApproval.isLoading} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Front Desk / Supervisor: arrivals/departures first */}
              {!isViewer && arrivalsCount > 0 && (
                <ArrivalCard arrivals={arrivals.data} t={t} />
              )}
              {!isViewer && departuresCount > 0 && (
                <DepartureCard departures={departures.data} t={t} />
              )}

              {/* Recent Activity — all roles */}
              <RecentActivityCard recentActivity={recentActivity} t={t} />

              {/* Quick Actions — not for Viewer */}
              {!isViewer && (
                <Card className="animate-fade-up animate-stagger-5">
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
              )}
            </div>

            {/* Maintenance & Laundry panels for all non-viewer, non-maintenance staff */}
            {!isViewer && !isMaintenance && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MaintenanceQueue />
                <LaundryPanel />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

function MaintenanceDashboard({ t }: { t: any }) {
  return (
    <div className="space-y-4">
      <MaintenanceQueue />
      <LaundryPanel />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            {t("dashboard.viewCalendar")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <QuickAction to="/calendar" icon={CalendarDays} label={t("dashboard.viewCalendar")} description="View occupied units and maintenance blocks" />
        </CardContent>
      </Card>
    </div>
  );
}

function ArrivalCard({ arrivals, t }: { arrivals: any[]; t: any }) {
  return (
    <Card className="animate-fade-up animate-stagger-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LogIn className="h-5 w-5 text-success" /> {t("dashboard.arrivingToday")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {arrivals?.map((b: any, i: number) => (
          <div key={b.id} className={`flex items-center justify-between text-sm border rounded-md p-3 animate-fade-up animate-stagger-${Math.min(i + 1, 8)}`}>
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
  );
}

function DepartureCard({ departures, t }: { departures: any[]; t: any }) {
  return (
    <Card className="animate-fade-up animate-stagger-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LogOut className="h-5 w-5 text-warning" /> {t("dashboard.departingToday")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {departures?.map((b: any, i: number) => (
          <div key={b.id} className={`flex items-center justify-between text-sm border rounded-md p-3 animate-fade-up animate-stagger-${Math.min(i + 1, 8)}`}>
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
  );
}

function RecentActivityCard({ recentActivity, t }: { recentActivity: any; t: any }) {
  return (
    <Card className="animate-fade-up animate-stagger-5">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{t("dashboard.recentActivity")}</CardTitle>
        <Link to="/bookings">
          <Button variant="ghost" size="sm" className="text-xs group">
            {t("common.viewAll")} <ArrowRight className="h-3 w-3 ml-1 transition-transform group-hover:translate-x-1" />
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
            {recentActivity.data.map((log: any, i: number) => {
              const unitName = log.bookings?.units?.name ?? t("common.unknown");
              const fromLabel = log.from_state ? t(`states.${log.from_state}`) : null;
              const toLabel = t(`states.${log.to_state}`);

              return (
                <div key={log.id} className={`flex items-start gap-3 text-sm animate-fade-up animate-stagger-${Math.min(i + 1, 8)}`}>
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
  );
}

function StatCard({ label, value, icon: Icon, description, stagger }: {
  label: string; value: number | null; icon: any; description: string; stagger: number;
}) {
  const animatedValue = useCountUp(value ?? 0);

  return (
    <Card className={`hover-lift animate-fade-up animate-stagger-${stagger}`}>
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
          <div className="text-3xl font-bold font-stat tracking-tight">{animatedValue}</div>
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
      <div className="group flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="rounded-md bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

export default Index;
