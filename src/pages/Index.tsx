import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, BookOpen, CalendarDays, TrendingUp, ArrowRight, Plus, LogIn, LogOut, Wrench, Shirt, MessageSquare, ShieldCheck, Check, X, FileText, Clock, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardStats } from "@/hooks/useDashboard";
import { type BookingState } from "@/lib/bookingStateMachine";
import { canAccessRoute, permissions } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useRolePreview } from "@/hooks/useRolePreview";
import { useProperty } from "@/hooks/useProperty";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { InquiryQueue } from "@/components/InquiryQueue";
import { MaintenanceQueue } from "@/components/MaintenanceQueue";
import { LaundryPanel } from "@/components/LaundryPanel";
import { HousekeepingPanel } from "@/components/HousekeepingPanel";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { TodaysPickupsWidget } from "@/components/TodaysPickupsWidget";
import { FlightForecastWidget } from "@/components/FlightForecastWidget";
import { CornerTalkPanel } from "@/components/CornerTalkPanel";
import { SessionIdentityStrip } from "@/components/SessionIdentityStrip";
import { StaffIntelStrip } from "@/components/StaffIntelStrip";
import { StaffQuickActionsWidget } from "@/components/StaffQuickActionsWidget";
import { ReconcilePaymentsCard } from "@/components/ReconcilePaymentsCard";
import { StripeDiagnosticsCard } from "@/components/StripeDiagnosticsCard";
import { StripeWebhookWizard } from "@/components/StripeWebhookWizard";
import { useOpenMaintenanceCount } from "@/hooks/useMaintenanceRequests";
import { usePendingHousekeepingCount } from "@/hooks/useHousekeepingTasks";
import { useCountUp } from "@/hooks/useCountUp";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { useDraftMessages, useApproveDraftMessage } from "@/hooks/useBookings";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";


const Index = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { effectiveRole } = useRolePreview();
  const { operationalMode } = useProperty();
  const { arrivals, departures, activeBookings, unitCount, recentActivity, pendingApproval, pendingInquiry, inquiryCount } = useDashboardStats();
  const { data: policySettings } = usePolicySettings();
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const flightForecastEnabled = policySettings?.find(s => s.key === "flight_forecast_enabled")?.value === "true";

  const arrivalsCount = arrivals.data?.length ?? 0;
  const departuresCount = departures.data?.length ?? 0;
  const activeCount = activeBookings.data ?? 0;
  const units = unitCount.data ?? 0;
  const inquiries = inquiryCount.data ?? 0;
  const isLoading = arrivals.isLoading || departures.isLoading || activeBookings.isLoading || unitCount.isLoading || inquiryCount.isLoading;

  const canApprove = permissions.canApproveBooking(effectiveRole);
  const canRecommend = permissions.canRecommendBooking(effectiveRole);
  const canViewQueues = canApprove || canRecommend || effectiveRole === "front_desk_supervisor";
  const isMaintenance = effectiveRole === "maintenance";
  const isViewer = effectiveRole === "viewer";
  const isAdmin = canApprove;

  const isLongStay = operationalMode === "long_stay";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("dashboard.welcome")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.overview")}</p>
        </div>

        {/* Which account / which build — kills the "my screen shows different
            numbers" confusion across phones and browsers. */}
        <SessionIdentityStrip />

        {/* Corner Talk — role-based intelligence briefing */}
        <CornerTalkPanel
          onAskGlitch={(question) => {
            window.dispatchEvent(
              new CustomEvent("ask-kru-glitch", { detail: { question } })
            );
          }}
        />

        {/* Staff Intel Strip — active intelligence entries */}
        <StaffIntelStrip />

        {/* Maintenance role: simplified view */}
        {isMaintenance ? (
          <MaintenanceDashboard t={t} />
        ) : (
          <>
            {/* Staff Quick Actions Widget */}
            {!isViewer && <StaffQuickActionsWidget />}

            {/* Stats Row — adapted by operational mode */}
            {isLongStay ? (
              <LongStayStats
                activeCount={activeCount}
                arrivalsCount={arrivalsCount}
                units={units}
                isLoading={isLoading}
                navigate={navigate}
                t={t}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard
                  label={t("dashboard.todaysArrivals")}
                  value={isLoading ? null : arrivalsCount}
                  icon={LogIn}
                  description={t("dashboard.checkInsToday", { count: arrivalsCount })}
                  stagger={1}
                  onClick={() => navigate("/bookings?filter=arriving_today")}
                />
                <StatCard
                  label={t("dashboard.todaysDepartures")}
                  value={isLoading ? null : departuresCount}
                  icon={LogOut}
                  description={t("dashboard.checkOutsToday", { count: departuresCount })}
                  stagger={2}
                  onClick={() => navigate("/bookings?filter=departing_today")}
                />
                <StatCard
                  label={t("dashboard.activeBookings")}
                  value={isLoading ? null : activeCount}
                  icon={BookOpen}
                  description={t("dashboard.acrossAllUnits")}
                  stagger={3}
                  onClick={() => navigate("/bookings?filter=active")}
                />
                <StatCard
                  label={t("dashboard.openInquiries")}
                  value={isLoading ? null : inquiries}
                  icon={MessageSquare}
                  description={t("dashboard.awaitingResponse")}
                  stagger={4}
                  onClick={() => navigate("/bookings?filter=inquiry")}
                />
                <StatCard
                  label={t("dashboard.activeUnits")}
                  value={isLoading ? null : units}
                  icon={Building2}
                  description={t("dashboard.unitsConfigured", { count: units })}
                  stagger={5}
                  onClick={() => navigate("/units")}
                />
              </div>
            )}

            {/* Admin/Manager layout: Approval queue prominent */}
            {canViewQueues && (
              <InquiryQueue bookings={pendingInquiry.data} isLoading={pendingInquiry.isLoading} readOnly={!canApprove && !canRecommend} />
            )}

            {canViewQueues && (
              <ApprovalQueue bookings={pendingApproval.data} isLoading={pendingApproval.isLoading} readOnly={!canApprove && !canRecommend} />
            )}

            {/* Admin-only: Pending Admin Actions (draft messages) */}
            {canApprove && <PendingAdminActions t={t} />}

            {/* Today's Pickups widget — high-turnover emphasis */}
            {!isViewer && !isLongStay && <TodaysPickupsWidget onClickBooking={setDetailBookingId} />}

            {/* Flight Forecast — airport traffic monitor (admin-toggled, high-turnover) */}
            {!isViewer && !isLongStay && flightForecastEnabled && <FlightForecastWidget />}

            {/* Long-stay: Housekeeping and Maintenance first */}
            {!isViewer && !isMaintenance && isLongStay && (
              <>
                <HousekeepingPanel />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <MaintenanceQueue />
                  <LaundryPanel />
                </div>
              </>
            )}

            {/* Long-stay: Pickups still available but lower priority */}
            {!isViewer && isLongStay && <TodaysPickupsWidget onClickBooking={setDetailBookingId} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Front Desk / Supervisor: arrivals/departures first */}
              {!isViewer && arrivalsCount > 0 && (
                <ArrivalCard arrivals={arrivals.data} t={t} onClickBooking={setDetailBookingId} />
              )}
              {!isViewer && departuresCount > 0 && (
                <DepartureCard departures={departures.data} t={t} onClickBooking={setDetailBookingId} />
              )}

              {/* Recent Activity — all roles */}
              <RecentActivityCard recentActivity={recentActivity} t={t} onClickBooking={setDetailBookingId} />

              {/* Quick Actions — not for Viewer */}
              {!isViewer && (
                <Card className="animate-fade-up animate-stagger-5">
                  <CardHeader>
                    <CardTitle className="text-lg">{t("dashboard.quickActions")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {canAccessRoute(effectiveRole, "/bookings") && (
                      <QuickAction to="/bookings" icon={Plus} label={t("dashboard.newBooking")} description={t("dashboard.createReservation")} />
                    )}
                    {canAccessRoute(effectiveRole, "/calendar") && (
                      <QuickAction to="/calendar" icon={CalendarDays} label={t("dashboard.viewCalendar")} description={t("dashboard.seeAvailability")} />
                    )}
                    {canAccessRoute(effectiveRole, "/units") && (
                      <QuickAction to="/units" icon={Building2} label={t("dashboard.manageUnits")} description={t("dashboard.addOrEditUnits")} />
                    )}
                    {canAccessRoute(effectiveRole, "/pricing") && (
                      <QuickAction to="/pricing" icon={TrendingUp} label={t("dashboard.pricingPolicies")} description={t("dashboard.configureRates")} />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* High-turnover: Housekeeping, Maintenance & Laundry panels at bottom */}
            {!isViewer && !isMaintenance && !isLongStay && (
              <HousekeepingPanel />
            )}
            {!isViewer && !isMaintenance && !isLongStay && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MaintenanceQueue />
                <LaundryPanel />
              </div>
            )}

            {/* Admin-only payment reconciliation sweep */}
            {isAdmin && <StripeDiagnosticsCard />}
            {isAdmin && <StripeWebhookWizard />}
            {isAdmin && <ReconcilePaymentsCard />}
          </>
        )}
      </div>


      {/* Detail sheet for clicking on bookings from arrivals/departures/activity */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        open={!!detailBookingId}
        onOpenChange={(open) => !open && setDetailBookingId(null)}
        isAdmin={isAdmin}
      />
    </DashboardLayout>
  );
};

function PendingAdminActions({ t }: { t: any }) {
  const { data: drafts, isLoading } = useDraftMessages();
  const approveDraft = useApproveDraftMessage();
  const count = drafts?.length ?? 0;

  const handleAction = async (messageId: string, bookingId: string, approve: boolean) => {
    try {
      await approveDraft.mutateAsync({ messageId, bookingId, approve });
      toast.success(approve ? t("adminActions.messageApproved") : t("adminActions.messageRejected"));
    } catch {
      toast.error(t("approval.actionFailed"));
    }
  };

  if (isLoading || count === 0) return null;

  return (
    <Card className="border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          {t("adminActions.title")}
          <Badge variant="destructive" className="ml-1 text-xs">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground mb-2">{t("adminActions.draftDesc")}</p>
        {drafts!.map((msg) => (
          <div key={msg.id} className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{msg.content}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(msg.created_at), "MMM d, h:mm a")}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" variant="default" className="h-7 px-2" onClick={() => handleAction(msg.id, msg.booking_id, true)} disabled={approveDraft.isPending}>
                <Check className="h-3 w-3 mr-1" /> {t("adminActions.send")}
              </Button>
              <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => handleAction(msg.id, msg.booking_id, false)} disabled={approveDraft.isPending}>
                <X className="h-3 w-3 mr-1" /> {t("adminActions.discard")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LongStayStats({ activeCount, arrivalsCount, units, isLoading, navigate, t }: {
  activeCount: number; arrivalsCount: number; units: number; isLoading: boolean; navigate: any; t: any;
}) {
  const { data: openMaintenance } = useOpenMaintenanceCount();
  const { data: pendingHousekeeping } = usePendingHousekeepingCount();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label={t("dashboard.activeBookings", { defaultValue: "Active Guests" })}
        value={isLoading ? null : activeCount}
        icon={Users}
        description={t("dashboard.longTermGuests", { defaultValue: "Currently staying" })}
        stagger={1}
        onClick={() => navigate("/bookings?filter=active")}
      />
      <StatCard
        label={t("dashboard.upcomingArrivals", { defaultValue: "Upcoming Arrivals" })}
        value={isLoading ? null : arrivalsCount}
        icon={LogIn}
        description={t("dashboard.arrivingThisWeek", { defaultValue: "Arriving soon" })}
        stagger={2}
        onClick={() => navigate("/bookings?filter=arriving_today")}
      />
      <StatCard
        label={t("dashboard.scheduledHousekeeping", { defaultValue: "Housekeeping" })}
        value={pendingHousekeeping ?? 0}
        icon={Clock}
        description={t("dashboard.pendingTasks", { defaultValue: "Pending tasks" })}
        stagger={3}
      />
      <StatCard
        label={t("dashboard.openMaintenance", { defaultValue: "Open Maintenance" })}
        value={openMaintenance ?? 0}
        icon={Wrench}
        description={t("dashboard.issuesTracked", { defaultValue: "Issues tracked" })}
        stagger={4}
      />
    </div>
  );
}

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

function ArrivalCard({ arrivals, t, onClickBooking }: { arrivals: any[]; t: any; onClickBooking: (id: string) => void }) {
  return (
    <Card className="animate-fade-up animate-stagger-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LogIn className="h-5 w-5 text-success" /> {t("dashboard.arrivingToday")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {arrivals?.map((b: any, i: number) => (
          <div
            key={b.id}
            className={`flex items-center justify-between text-sm border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition-colors animate-fade-up animate-stagger-${Math.min(i + 1, 8)}`}
            onClick={() => onClickBooking(b.id)}
          >
            <div>
              <span className="font-medium">{b.units?.name ?? "—"}</span>
              <span className="text-muted-foreground ml-2">· {resolveGuestDisplayName(b)}</span>
            </div>
            <Badge variant="outline">{t("bookings.guestCount", { count: b.num_guests })}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DepartureCard({ departures, t, onClickBooking }: { departures: any[]; t: any; onClickBooking: (id: string) => void }) {
  return (
    <Card className="animate-fade-up animate-stagger-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LogOut className="h-5 w-5 text-warning" /> {t("dashboard.departingToday")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {departures?.map((b: any, i: number) => (
          <div
            key={b.id}
            className={`flex items-center justify-between text-sm border rounded-md p-3 cursor-pointer hover:bg-accent/50 transition-colors animate-fade-up animate-stagger-${Math.min(i + 1, 8)}`}
            onClick={() => onClickBooking(b.id)}
          >
            <div>
              <span className="font-medium">{b.units?.name ?? "—"}</span>
              <span className="text-muted-foreground ml-2">· {resolveGuestDisplayName(b)}</span>
            </div>
            <Badge variant="outline">{t("bookings.guestCount", { count: b.num_guests })}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({ recentActivity, t, onClickBooking }: { recentActivity: any; t: any; onClickBooking: (id: string) => void }) {
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
              const isPickup = log._type === "pickup";
              const fromLabel = log.from_state ? t(`states.${log.from_state}`, log.from_state) : null;
              const toLabel = isPickup ? log.action?.replace("status_", "").replace("_", " ") : t(`states.${log.to_state}`);

              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 text-sm cursor-pointer hover:bg-accent/30 rounded-md p-1 -m-1 transition-colors animate-fade-up animate-stagger-${Math.min(i + 1, 8)}`}
                  onClick={() => onClickBooking(log.booking_id)}
                >
                  <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${isPickup ? "bg-blue-500" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground">
                      <span className="font-medium">{unitName}</span>
                      {" — "}
                      {isPickup ? (
                        <span className="text-blue-600 dark:text-blue-400">✈ {log.reason ?? toLabel}</span>
                      ) : fromLabel ? (
                        <span>{fromLabel} → {toLabel}</span>
                      ) : (
                        <span>{t("dashboard.createdAs", { state: toLabel })}</span>
                      )}
                    </p>
                    {!isPickup && log.reason && (
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

function StatCard({ label, value, icon: Icon, description, stagger, onClick }: {
  label: string; value: number | null; icon: any; description: string; stagger: number; onClick?: () => void;
}) {
  const animatedValue = useCountUp(value ?? 0);

  return (
    <Card
      className={`hover-lift animate-fade-up animate-stagger-${stagger} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
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
