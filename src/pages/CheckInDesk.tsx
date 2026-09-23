/**
 * Check-In Desk — the arrival and departure screen.
 *
 * Two jobs, nothing else: move a confirmed booking to checked-in when the guest
 * walks in, and close a checked-in stay at departure. Every action shows the
 * money still owed before it commits, and reports whether the guest's
 * confirmation email actually left the building.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LogIn,
  LogOut,
  RefreshCcw,
  AlertTriangle,
  MailCheck,
  MailX,
  CheckCircle2,
  Clock,
  Car,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  useCheckInDesk,
  useDeskCheckIn,
  useDeskCheckOut,
  type DeskBooking,
  type EmailOutcome,
} from "@/hooks/useCheckInDesk";
import { useAuth } from "@/hooks/useAuth";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { FetchErrorState } from "@/components/FetchErrorState";
import { formatPrice } from "@/lib/currency";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

type Mode = "in" | "out";

export default function CheckInDesk() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { sections, isLoading, isError, refetch } = useCheckInDesk();
  const checkIn = useDeskCheckIn();
  const checkOut = useDeskCheckOut();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ booking: DeskBooking; mode: Mode } | null>(null);
  const [note, setNote] = useState("");
  // Staff sign-off for an airport pickup that is still open on this booking.
  const [pickupDone, setPickupDone] = useState(true);

  const busy = checkIn.isPending || checkOut.isPending;

  const reportEmail = (outcome: EmailOutcome) => {
    if (outcome.sent) {
      toast.success(t("checkInDesk.email.sent"));
    } else {
      toast.warning(t("checkInDesk.email.notSent", { reason: outcome.reason ?? "unknown" }));
    }
  };

  const commit = async () => {
    if (!target) return;
    const { booking, mode } = target;
    try {
      const completePickupToo = !!booking.pickup?.needsCompletion && pickupDone;
      const outcome =
        mode === "in"
          ? await checkIn.mutateAsync({ booking, note, completePickupToo })
          : await checkOut.mutateAsync({ booking, note, completePickupToo });
      toast.success(
        mode === "in"
          ? t("checkInDesk.toast.checkedIn", { name: resolveGuestDisplayName(booking) })
          : t("checkInDesk.toast.checkedOut", { name: resolveGuestDisplayName(booking) }),
      );
      reportEmail(outcome);
      setTarget(null);
      setNote("");
    } catch (e: any) {
      toast.error(e?.message ?? t("checkInDesk.toast.failed"));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5" data-ai-focus="check-in-desk">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <LogIn className="h-6 w-6 text-primary" /> {t("checkInDesk.title")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("checkInDesk.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCcw className="h-4 w-4 mr-2" /> {t("common.refresh")}
          </Button>
        </div>

        {isError && <FetchErrorState onRetry={refetch} />}

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label={t("checkInDesk.stats.arrivals")}
            value={sections.arrivals.length}
            icon={<LogIn className="h-4 w-4" />}
          />
          <StatCard
            label={t("checkInDesk.stats.departures")}
            value={sections.dueDepartures.length}
            icon={<LogOut className="h-4 w-4" />}
          />
          <StatCard
            label={t("checkInDesk.stats.unresolvedMoney")}
            value={sections.unresolvedMoney.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={sections.unresolvedMoney.length > 0 ? "warn" : undefined}
          />
        </div>

        <Tabs defaultValue="arrivals">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="arrivals">
              {t("checkInDesk.tabs.arrivals", { count: sections.arrivals.length })}
            </TabsTrigger>
            <TabsTrigger value="departures">
              {t("checkInDesk.tabs.departures", { count: sections.departures.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arrivals" className="space-y-3 mt-4">
            <DeskList
              isLoading={isLoading}
              bookings={sections.arrivals}
              mode="in"
              emptyText={t("checkInDesk.empty.arrivals")}
              disabled={busy}
              onOpen={setDetailId}
              onAct={(booking) => {
                setNote("");
                setPickupDone(true);
                setTarget({ booking, mode: "in" });
              }}
            />
          </TabsContent>

          <TabsContent value="departures" className="space-y-3 mt-4">
            <DeskList
              isLoading={isLoading}
              bookings={sections.departures}
              mode="out"
              emptyText={t("checkInDesk.empty.departures")}
              disabled={busy}
              onOpen={setDetailId}
              onAct={(booking) => {
                setNote("");
                setPickupDone(true);
                setTarget({ booking, mode: "out" });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <BookingDetailSheet
        bookingId={detailId}
        isAdmin={isAdmin}
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
      />

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.mode === "in"
                ? t("checkInDesk.confirm.inTitle")
                : t("checkInDesk.confirm.outTitle")}
            </DialogTitle>
            <DialogDescription>
              {target
                ? t("checkInDesk.confirm.body", {
                    name: resolveGuestDisplayName(target.booking),
                    unit: target.booking.units?.name ?? "—",
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          {target && !target.booking.settled && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t("checkInDesk.confirm.balanceWarning", {
                  amount: formatPrice(target.booking.outstanding),
                })}
              </p>
              <p className="text-muted-foreground mt-1">
                {t("checkInDesk.confirm.balanceHint")}
              </p>
            </div>
          )}

          {target?.booking.pickup && target.booking.pickup.needsCompletion && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="desk-pickup"
                  checked={pickupDone}
                  onCheckedChange={(v) => setPickupDone(v === true)}
                />
                <div className="space-y-1">
                  <label htmlFor="desk-pickup" className="text-sm font-medium flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary" />
                    {t("checkInDesk.confirm.pickupLabel")}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t("checkInDesk.confirm.pickupHint")}
                  </p>
                  {!!target.booking.pickup.fee && (
                    <p className="text-xs text-muted-foreground">
                      {t("checkInDesk.confirm.pickupFee", {
                        amount: formatPrice(target.booking.pickup.fee),
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {target?.booking.pickup?.completed_at && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
              {t("checkInDesk.confirm.pickupDone")}
            </p>
          )}

          {target && !target.booking.hasGuestAccount && (
            <p className="text-xs text-muted-foreground">
              {t("checkInDesk.confirm.noGuestAccount")}
            </p>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="desk-note">
              {t("checkInDesk.confirm.noteLabel")}
            </label>
            <Textarea
              id="desk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("checkInDesk.confirm.notePlaceholder")}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={commit} disabled={busy}>
              {target?.mode === "in" ? (
                <LogIn className="h-4 w-4 mr-2" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              {target?.mode === "in"
                ? t("checkInDesk.actions.checkIn")
                : t("checkInDesk.actions.checkOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <Card className={tone === "warn" ? "border-warning/40" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DeskList({
  isLoading,
  bookings,
  mode,
  emptyText,
  disabled,
  onOpen,
  onAct,
}: {
  isLoading: boolean;
  bookings: DeskBooking[];
  mode: Mode;
  emptyText: string;
  disabled: boolean;
  onOpen: (id: string) => void;
  onAct: (booking: DeskBooking) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <Card
          key={b.id}
          className="transition-transform duration-300 hover:-translate-y-1"
        >
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold truncate">{resolveGuestDisplayName(b)}</p>
                <Badge variant="outline">{b.units?.name ?? "—"}</Badge>
                {b.overdue && (
                  <Badge className="bg-warning/20 text-warning-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    {mode === "in"
                      ? t("checkInDesk.badges.lateArrival")
                      : t("checkInDesk.badges.lateDeparture")}
                  </Badge>
                )}
                {b.arrived_at && mode === "in" && (
                  <Badge className="bg-info/20 text-[hsl(var(--info))]">
                    {t("checkInDesk.badges.arrived")}
                  </Badge>
                )}
                {b.pickup?.needsCompletion && (
                  <Badge className="bg-warning/20 text-warning-foreground">
                    <Car className="h-3 w-3 mr-1" />
                    {t("checkInDesk.badges.pickupOpen")}
                  </Badge>
                )}
                {b.pickup && !b.pickup.needsCompletion && b.pickup.completed_at && (
                  <Badge variant="secondary">
                    <Car className="h-3 w-3 mr-1" />
                    {t("checkInDesk.badges.pickupDone")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {format(parseISO(b.check_in), "d MMM")} → {format(parseISO(b.check_out), "d MMM")} ·{" "}
                {t("checkInDesk.nights", { count: b.nights })}
              </p>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {b.settled ? (
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--success))]">
                    <CheckCircle2 className="h-3 w-3" /> {t("checkInDesk.paidInFull")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warning-foreground">
                    <AlertTriangle className="h-3 w-3" />
                    {t("checkInDesk.owed", { amount: formatPrice(b.outstanding) })}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  {b.guestEmail ? (
                    <>
                      <MailCheck className="h-3 w-3" /> {b.guestEmail}
                    </>
                  ) : (
                    <>
                      <MailX className="h-3 w-3" /> {t("checkInDesk.noEmail")}
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => onOpen(b.id)}>
                {t("checkInDesk.actions.openBooking")}
              </Button>
              {/* Talk to the guest standing in front of you without leaving the desk. */}
              <GuestThreadLauncher
                bookingId={b.id}
                guestName={resolveGuestDisplayName(b)}
                headline={b.units?.name ?? undefined}
                onOpenBooking={() => onOpen(b.id)}
                className="h-8 text-xs gap-1"
              />
              <Button size="sm" disabled={disabled} onClick={() => onAct(b)}>
                {mode === "in" ? (
                  <LogIn className="h-4 w-4 mr-2" />
                ) : (
                  <LogOut className="h-4 w-4 mr-2" />
                )}
                {mode === "in"
                  ? t("checkInDesk.actions.checkIn")
                  : t("checkInDesk.actions.checkOut")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
