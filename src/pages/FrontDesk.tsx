import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  LogIn,
  LogOut,
  UserCheck,
  Clock,
  AlertTriangle,
  FileText,
  Sparkles,
  Phone,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Bed,
  CalendarClock,
  RefreshCcw,
} from "lucide-react";
import { useFrontDeskData, useRecentOverrides, useMarkArrived, type FrontDeskBooking } from "@/hooks/useFrontDesk";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { STATE_LABELS, STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { formatPrice } from "@/lib/currency";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { OperationsIntelligencePanel } from "@/components/front-desk/OperationsIntelligencePanel";
import { OperationalAlerts } from "@/components/front-desk/OperationalAlerts";
import { GuestJourneyTimeline } from "@/components/front-desk/GuestJourneyTimeline";
import { TodaysBriefing } from "@/components/front-desk/TodaysBriefing";
import { PickupStatusStrip } from "@/components/front-desk/PickupStatusStrip";
import { TurnoverBoard } from "@/components/front-desk/TurnoverBoard";
import { computeOperationalStatus, TONE_CLASS } from "@/lib/operationalStatus";
import { formatDistanceToNow } from "date-fns";

const TURNOVER_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Turnover Pending", tone: "bg-warning/20 text-warning-foreground" },
  in_progress: { label: "Cleaning", tone: "bg-info/20 text-[hsl(var(--info))]" },
  completed: { label: "Turnover Ready", tone: "bg-success/20 text-[hsl(var(--success))]" },
};

export default function FrontDesk() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isManagerPlus = role === "admin" || role === "manager";
  const { sections, intelligence, todaysTasks, pickupByBooking, lastMessageByBooking, isLoading, refetch } = useFrontDeskData();
  const { data: overrides } = useRecentOverrides(isManagerPlus);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [arrivedDialogFor, setArrivedDialogFor] = useState<FrontDeskBooking | null>(null);

  const totals = {
    arriving: sections.arrivingToday.length,
    arrivedWaiting: sections.arrivedNotCheckedIn.length,
    staying: sections.currentlyStaying.length,
    departing: sections.departingToday.length,
    upcoming: sections.upcoming.length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-5" data-ai-focus="front-desk">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-primary" /> Front Desk
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Operations Intelligence — every guest, every signal, one screen.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Today's Briefing — deterministic by default, optional AI narration */}
        <TodaysBriefing
          sections={sections}
          todaysPickupCount={intelligence?.todaysPickupCount ?? 0}
          turnoverPendingCount={intelligence?.turnoverPendingCount ?? 0}
        />

        {/* Operations Intelligence Panel — surfaces existing data, no new workflows */}
        <OperationsIntelligencePanel
          sections={sections}
          todaysPickupCount={intelligence?.todaysPickupCount ?? 0}
          turnoverPendingCount={intelligence?.turnoverPendingCount ?? 0}
          pickupByBooking={pickupByBooking}
        />

        {/* Operational Alerts — risk roll-up */}
        <OperationalAlerts sections={sections} onOpen={setDetailId} />

        {/* Pickup Status Strip — today's airport pickups, read-only */}
        <PickupStatusStrip
          bookings={[...sections.arrivingToday, ...sections.arrivedNotCheckedIn]}
          pickupByBooking={pickupByBooking}
          onOpen={setDetailId}
        />

        {/* Cleaning Today — open housekeeping tasks straight from the source */}
        <TurnoverBoard
          tasks={todaysTasks}
          arriving={sections.arrivingToday}
          onOpen={setDetailId}
        />





        <Tabs defaultValue="arriving" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="arriving">Arriving ({totals.arriving})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({totals.upcoming})</TabsTrigger>
            <TabsTrigger value="staying">Staying ({totals.staying})</TabsTrigger>
            <TabsTrigger value="departing">Departing ({totals.departing})</TabsTrigger>
            {isManagerPlus && <TabsTrigger value="overrides">Overrides</TabsTrigger>}
          </TabsList>

          <TabsContent value="arriving" className="space-y-3 mt-4">
            <SectionList
              isLoading={isLoading}
              bookings={sections.arrivingToday}
              emptyText="No arrivals today."
              variant="arriving"
              onOpen={setDetailId}
              onMarkArrived={setArrivedDialogFor}
              pickupByBooking={pickupByBooking}
              lastMessageByBooking={lastMessageByBooking}
            />
          </TabsContent>
          <TabsContent value="staying" className="space-y-3 mt-4">
            <SectionList
              isLoading={isLoading}
              bookings={sections.currentlyStaying}
              emptyText="No one is currently staying."
              variant="staying"
              onOpen={setDetailId}
              pickupByBooking={pickupByBooking}
              lastMessageByBooking={lastMessageByBooking}
            />
          </TabsContent>
          <TabsContent value="departing" className="space-y-3 mt-4">
            <SectionList
              isLoading={isLoading}
              bookings={sections.departingToday}
              emptyText="No departures today."
              variant="departing"
              onOpen={setDetailId}
              pickupByBooking={pickupByBooking}
              lastMessageByBooking={lastMessageByBooking}
            />
          </TabsContent>
          <TabsContent value="upcoming" className="space-y-3 mt-4">
            <SectionList
              isLoading={isLoading}
              bookings={sections.upcoming}
              emptyText="No upcoming arrivals in the next 7 days."
              variant="upcoming"
              onOpen={setDetailId}
              pickupByBooking={pickupByBooking}
              lastMessageByBooking={lastMessageByBooking}
            />
          </TabsContent>

          {isManagerPlus && (
            <TabsContent value="overrides" className="space-y-3 mt-4">
              <OverridesPanel rows={overrides ?? []} />
            </TabsContent>
          )}
        </Tabs>
      </div>


      <BookingDetailSheet
        bookingId={detailId}
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        isAdmin={isAdmin}
      />

      <MarkArrivedDialog
        booking={arrivedDialogFor}
        onClose={() => setArrivedDialogFor(null)}
      />
    </DashboardLayout>
  );
}

// ─── KPI tile ───
function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${tone}`} />
          <div>
            <div className="text-2xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section list ───
type PickupMap = Map<string, { status: string | null; arrival_datetime: string | null }>;
type LastMsgMap = Map<string, { content: string; sender_id: string | null; created_at: string; is_read: boolean | null; from_guest: boolean }>;

function SectionList({
  isLoading,
  bookings,
  emptyText,
  variant,
  onOpen,
  onMarkArrived,
  pickupByBooking,
  lastMessageByBooking,
}: {
  isLoading: boolean;
  bookings: FrontDeskBooking[];
  emptyText: string;
  variant: "arriving" | "waiting" | "staying" | "departing" | "upcoming";
  onOpen: (id: string) => void;
  onMarkArrived?: (b: FrontDeskBooking) => void;
  pickupByBooking?: PickupMap;
  lastMessageByBooking?: LastMsgMap;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }
  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          {emptyText}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <BookingRow
          key={b.id}
          booking={b}
          variant={variant}
          onOpen={onOpen}
          onMarkArrived={onMarkArrived}
          pickup={pickupByBooking?.get(b.id) ?? null}
          lastMessage={lastMessageByBooking?.get(b.id) ?? null}
        />
      ))}
    </div>
  );
}

// ─── Booking row ───
function BookingRow({
  booking,
  variant,
  onOpen,
  onMarkArrived,
  pickup,
  lastMessage,
}: {
  booking: FrontDeskBooking;
  variant: "arriving" | "waiting" | "staying" | "departing" | "upcoming";
  onOpen: (id: string) => void;
  onMarkArrived?: (b: FrontDeskBooking) => void;
  pickup?: { status: string | null; arrival_datetime: string | null } | null;
  lastMessage?: { content: string; created_at: string; is_read: boolean | null; from_guest: boolean } | null;
}) {
  const guestName = resolveGuestDisplayName(booking as any);
  const unitName = booking.units?.name ?? "—";
  const nights = differenceInCalendarDays(
    parseISO(booking.check_out),
    parseISO(booking.check_in)
  );
  const nightsLeft =
    variant === "staying" || variant === "departing"
      ? Math.max(0, differenceInCalendarDays(parseISO(booking.check_out), new Date()))
      : null;

  const warnings: string[] = [];
  if (booking.outstanding > 0) warnings.push(`Balance owed: ${formatPrice(booking.outstanding)}`);
  if (!booking.depositPaid && (variant === "arriving" || variant === "waiting"))
    warnings.push("Deposit unpaid");
  if (
    variant !== "upcoming" &&
    (!booking.securityDeposit || booking.securityDeposit.status !== "held")
  ) {
    if (variant === "arriving" || variant === "waiting")
      warnings.push("Security deposit not collected");
  }
  if (booking.docCount === 0 && (variant === "arriving" || variant === "waiting"))
    warnings.push("ID document missing");
  if (
    variant === "departing" &&
    booking.turnover?.status !== "completed" &&
    booking.turnover?.status
  ) {
    // departure cards lead into turnover handoff
  }
  if (
    variant === "arriving" &&
    booking.turnover &&
    booking.turnover.status !== "completed"
  ) {
    warnings.push("Turnover not ready");
  }

  const opStatus = computeOperationalStatus(booking);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground text-base truncate">{guestName}</h3>
              <Badge variant="outline" className="text-[10px]">{unitName}</Badge>
              <Badge className={`text-[10px] border ${TONE_CLASS[opStatus.tone]}`}>
                {opStatus.label}
              </Badge>
              <Badge className={`text-[10px] ${STATE_VARIANTS[booking.state as BookingState] ?? ""}`}>
                {STATE_LABELS[booking.state as BookingState] ?? booking.state}
              </Badge>
              {booking.arrived_at && (
                <Badge className="text-[10px] bg-info/20 text-[hsl(var(--info))]">
                  Arrived {format(parseISO(booking.arrived_at), "HH:mm")}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span>
                {format(parseISO(booking.check_in), "MMM d")} →{" "}
                {format(parseISO(booking.check_out), "MMM d")} · {nights} nights
              </span>
              {nightsLeft !== null && (
                <span className="text-foreground">{nightsLeft} nights remaining</span>
              )}
              <span>· {booking.num_guests} guest{booking.num_guests > 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Financials */}
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-semibold">{formatPrice(booking.total_price ?? 0)}</div>
            {booking.outstanding > 0 ? (
              <div className="text-xs text-destructive font-medium mt-0.5">
                {formatPrice(booking.outstanding)} owed
              </div>
            ) : (
              <div className="text-xs text-[hsl(var(--success))] font-medium mt-0.5">Paid in full</div>
            )}
          </div>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge
            variant="outline"
            className={booking.depositPaid ? "border-[hsl(var(--success))] text-[hsl(var(--success))]" : "border-warning text-warning-foreground"}
          >
            {booking.depositPaid ? "Deposit paid" : "Deposit pending"}
          </Badge>
          {booking.securityDeposit ? (
            <Badge
              variant="outline"
              className={
                booking.securityDeposit.status === "held"
                  ? "border-[hsl(var(--success))] text-[hsl(var(--success))]"
                  : booking.securityDeposit.status === "released"
                  ? "border-muted-foreground text-muted-foreground"
                  : "border-warning text-warning-foreground"
              }
            >
              Sec. deposit: {booking.securityDeposit.status}
            </Badge>
          ) : (
            (variant === "arriving" || variant === "waiting") && (
              <Badge variant="outline" className="border-warning text-warning-foreground">
                Sec. deposit not collected
              </Badge>
            )
          )}
          <Badge
            variant="outline"
            className={booking.docCount > 0 ? "" : "border-warning text-warning-foreground"}
          >
            <FileText className="h-3 w-3 mr-1" />
            {booking.docCount > 0 ? `${booking.docCount} doc${booking.docCount > 1 ? "s" : ""}` : "Docs missing"}
          </Badge>
          {booking.turnover && (
            <Badge
              className={
                TURNOVER_LABELS[booking.turnover.status]?.tone ??
                "bg-muted text-muted-foreground"
              }
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {TURNOVER_LABELS[booking.turnover.status]?.label ?? booking.turnover.status}
            </Badge>
          )}
          {booking.arrival_note && (
            <Badge variant="outline" className="text-[10px]">
              Note: {booking.arrival_note}
            </Badge>
          )}
        </div>

        {/* Guest Journey Timeline — presentation only */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <GuestJourneyTimeline booking={booking} pickup={pickup ?? null} />
        </div>

        {/* Comms snapshot — last message, read state, deep link to thread */}
        {lastMessage && (
          <button
            type="button"
            onClick={() => onOpen(booking.id)}
            className="mt-3 w-full text-left flex items-start gap-2 text-xs rounded-md p-2 bg-muted/30 hover:bg-muted/60 transition-colors border border-border/40"
          >
            <MessageSquare className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${lastMessage.from_guest && lastMessage.is_read === false ? "text-[hsl(var(--info))]" : "text-muted-foreground"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                <span>{lastMessage.from_guest ? "Guest" : "Staff"}</span>
                <span>· {formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true })}</span>
                {lastMessage.from_guest && lastMessage.is_read === false && (
                  <span className="text-[hsl(var(--info))] font-medium">· Unread</span>
                )}
              </div>
              <div className="text-foreground truncate mt-0.5">{lastMessage.content || "(attachment)"}</div>
            </div>
          </button>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-xs text-warning-foreground bg-warning/10 rounded-md p-2 border border-warning/30">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>{warnings.join(" · ")}</div>
          </div>
        )}


        {/* Actions */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {variant === "arriving" && (
            <>
              <Button size="sm" variant="default" onClick={() => onMarkArrived?.(booking)}>
                <UserCheck className="h-4 w-4 mr-1" /> Mark Arrived
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onOpen(booking.id)}>
                <LogIn className="h-4 w-4 mr-1" /> Check In
              </Button>
              <MarkNoShowButton bookingId={booking.id} currentState={booking.state as BookingState} />
            </>
          )}
          {variant === "waiting" && (
            <>
              <Button size="sm" variant="default" onClick={() => onOpen(booking.id)}>
                <LogIn className="h-4 w-4 mr-1" /> Check In
              </Button>
            </>
          )}
          {variant === "staying" && (
            <Button size="sm" variant="default" onClick={() => onOpen(booking.id)}>
              <LogOut className="h-4 w-4 mr-1" /> Check Out
            </Button>
          )}
          {variant === "departing" && (
            <Button size="sm" variant="default" onClick={() => onOpen(booking.id)}>
              <LogOut className="h-4 w-4 mr-1" /> Check Out
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onOpen(booking.id)}>
            Open Booking
          </Button>
          {booking.profiles?.phone && (
            <>
              <Button size="sm" variant="ghost" asChild>
                <a href={`tel:${booking.profiles.phone}`}>
                  <Phone className="h-4 w-4 mr-1" /> Call
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a
                  href={`https://wa.me/${booking.profiles.phone.replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageSquare className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`sms:${booking.profiles.phone}`}>
                  <MessageSquare className="h-4 w-4 mr-1" /> SMS
                </a>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mark No-Show ───
function MarkNoShowButton({ bookingId, currentState }: { bookingId: string; currentState: BookingState }) {
  const transition = useTransitionBookingState();
  const handle = () => {
    if (!confirm("Mark this booking as no-show? This cancels the arrival.")) return;
    transition.mutate({
      bookingId,
      currentState,
      newState: "no_show",
      reason: "Marked no-show from front desk",
    } as any);
  };
  return (
    <Button size="sm" variant="ghost" onClick={handle} className="text-destructive">
      <XCircle className="h-4 w-4 mr-1" /> No-Show
    </Button>
  );
}

// ─── Mark Arrived dialog ───
function MarkArrivedDialog({
  booking,
  onClose,
}: {
  booking: FrontDeskBooking | null;
  onClose: () => void;
}) {
  const markArrived = useMarkArrived();
  const [note, setNote] = useState("");

  const handleConfirm = async () => {
    if (!booking) return;
    await markArrived.mutateAsync({ bookingId: booking.id, note });
    setNote("");
    onClose();
  };

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark guest as arrived</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {resolveGuestDisplayName(booking as any)}
            </span>{" "}
            is physically here. Their booking stays in{" "}
            <Badge className="text-[10px] mx-1">
              {booking ? STATE_LABELS[booking.state as BookingState] : ""}
            </Badge>{" "}
            until you complete check-in.
          </p>
          <div>
            <label className="text-xs text-muted-foreground">Optional note</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. waiting in lobby, room not ready yet"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={markArrived.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Confirm Arrival
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Overrides panel ───
function OverridesPanel({ rows }: { rows: any[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          No override events found.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning" /> Recent overrides
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => {
          const guest = resolveGuestDisplayName(r.bookings as any);
          const unit = r.bookings?.units?.name ?? "—";
          return (
            <div
              key={r.id}
              className="text-xs border-l-2 border-warning pl-3 py-1.5 space-y-0.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">{guest}</span>
                <span className="text-muted-foreground">· {unit}</span>
                {r.from_state && (
                  <Badge variant="outline" className="text-[9px]">
                    {STATE_LABELS[r.from_state as BookingState] ?? r.from_state} →{" "}
                    {STATE_LABELS[r.to_state as BookingState] ?? r.to_state}
                  </Badge>
                )}
                <span className="text-muted-foreground ml-auto">
                  {format(parseISO(r.created_at), "MMM d, HH:mm")}
                </span>
              </div>
              <div className="text-muted-foreground">{r.reason}</div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
