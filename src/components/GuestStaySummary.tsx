import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logGuestPortalEvent } from "@/lib/guestPortalTelemetry";

import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useStayEssentials } from "@/hooks/useStayEssentials";
import { formatPrice } from "@/lib/currency";
import { calculateOutstanding } from "@/lib/paymentTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays, CreditCard, Plane, Shield, ArrowRight, CheckCircle2,
  Clock, AlertCircle, MapPin, Upload, PlaneLanding, Wrench, Sparkles,
  Wifi, ScrollText, Phone,
} from "lucide-react";
import { format, differenceInDays, isPast, isToday, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrivalWelcomeDialog, ArrivalWelcomeCard, detectAirport } from "@/components/ArrivalWelcomeGuide";
import { LandedConfirmationDialog } from "@/components/LandedConfirmationDialog";
import { useFlightTrackingBatch } from "@/hooks/useFlightTracking";

interface BookingWithUnit {
  id: string;
  state: string;
  check_in: string;
  check_out: string;
  total_price: number | null;
  unit_id: string;
  arrival_details?: any;
  units?: { name: string } | null;
}

const STATE_CONFIG: Record<string, { key: string; variant: string; icon: typeof CheckCircle2 }> = {
  inquiry: { key: "guestStay.inquirySent", variant: "bg-muted text-muted-foreground", icon: Clock },
  soft_hold: { key: "guestStay.softHold", variant: "bg-muted text-muted-foreground", icon: Clock },
  pending_approval: { key: "guestStay.awaitingApproval", variant: "bg-warning/15 text-warning-foreground", icon: Clock },
  pending_deposit: { key: "guestStay.depositRequired", variant: "bg-warning/15 text-warning-foreground", icon: AlertCircle },
  confirmed: { key: "guestStay.confirmed", variant: "bg-success/15 text-[hsl(var(--success))]", icon: CheckCircle2 },
  checked_in: { key: "guestStay.checkedIn", variant: "bg-primary/15 text-primary", icon: CheckCircle2 },
};

interface EdgeFlags {
  depositOverdue: boolean;
  checkinPassed: boolean;
  pickupPendingDriver: boolean;
  missingUnit: boolean;
}

function getEdgeFlags(
  booking: BookingWithUnit,
  outstanding: number,
  pickup: any | undefined,
  policies: any[] | undefined
): EdgeFlags {
  const checkinDate = parseISO(booking.check_in);
  const depositDeadlineHours = Number(policies?.find((p) => p.key === "deposit_deadline_hours")?.value ?? 24);

  const depositOverdue =
    booking.state === "pending_deposit" &&
    outstanding > 0 &&
    isPast(new Date(new Date(booking.check_in).getTime() - depositDeadlineHours * 3600_000));

  const checkinPassed =
    booking.state === "confirmed" && isPast(checkinDate) && !isToday(checkinDate);

  const pickupPendingDriver =
    !!pickup && pickup.status === "requested" && !pickup.driver_id;

  const missingUnit = !booking.units?.name;

  return { depositOverdue, checkinPassed, pickupPendingDriver, missingUnit };
}

function getNextStep(
  booking: BookingWithUnit,
  outstanding: number,
  edge: EdgeFlags,
  t: (k: string, opts?: any) => string
): string {
  if (edge.checkinPassed) return t("guestStay.checkinPassed");
  if (edge.depositOverdue) return t("guestStay.depositOverdue");

  switch (booking.state) {
    case "inquiry":
    case "soft_hold":
      return t("guestStay.waitingReview");
    case "pending_approval":
      return t("guestStay.beingReviewed");
    case "pending_deposit":
      return outstanding > 0 ? t("guestStay.payDeposit") : t("guestStay.depositProcessing");
    case "confirmed": {
      const daysUntil = differenceInDays(parseISO(booking.check_in), new Date());
      if (daysUntil <= 0) return t("guestStay.checkinToday");
      if (daysUntil <= 3) return t("guestStay.checkinSoon", { days: daysUntil });
      return t("guestStay.allSet", { date: format(parseISO(booking.check_in), "MMM d") });
    }
    case "checked_in":
      return outstanding > 0
        ? t("guestStay.outstandingBalance")
        : t("guestStay.enjoyStay", { date: format(parseISO(booking.check_out), "MMM d") });
    default:
      return t("guestStay.contactStaff");
  }
}

type ActionType = "pay_deposit" | "upload_id" | "landed" | "view_pickup" | "report_issue" | "ask_ai" | "stay_essentials";

interface GuestAction {
  type: ActionType;
  labelKey: string;
  icon: typeof CreditCard;
  variant?: "default" | "outline" | "destructive";
}

function deriveActions(
  booking: BookingWithUnit,
  outstanding: number,
  pickup: any | undefined,
  docs: any[] | undefined,
): GuestAction[] {
  const actions: GuestAction[] = [];

  // Pay deposit
  if (booking.state === "pending_deposit" && outstanding > 0) {
    actions.push({ type: "pay_deposit", labelKey: "guestStay.actions.payDeposit", icon: CreditCard });
  }

  // Upload ID (if no verified doc and pre-arrival relevant states)
  if (["pending_deposit", "confirmed"].includes(booking.state)) {
    const hasVerified = (docs ?? []).some((d: any) => d.verification_status === "verified");
    if (!hasVerified) {
      actions.push({ type: "upload_id", labelKey: "guestStay.actions.uploadId", icon: Upload, variant: "outline" });
    }
  }

  // I've landed (if pickup exists, not already landed, and around check-in time)
  if (pickup && !pickup.guest_landed_at && ["requested", "assigned", "confirmed"].includes(pickup.status)) {
    const checkinDate = parseISO(booking.check_in);
    const daysBefore = differenceInDays(checkinDate, new Date());
    // Show "I've landed" from 1 day before check-in through check-in day
    if (daysBefore <= 1 && (booking.state === "confirmed" || isToday(checkinDate) || isPast(checkinDate))) {
      actions.push({ type: "landed", labelKey: "guestStay.actions.landed", icon: PlaneLanding });
    }
  }

  // Report issue / need help (checked in)
  if (booking.state === "checked_in") {
    actions.push({ type: "report_issue", labelKey: "guestStay.actions.reportIssue", icon: Wrench, variant: "outline" });
  }

  // Ask Kru Glitch (always available as last action)
  if (actions.length < 4) {
    actions.push({ type: "ask_ai", labelKey: "guestStay.actions.askGlitch", icon: Sparkles, variant: "outline" });
  }

  return actions.slice(0, 4);
}

export function GuestStaySummary({ focusSection, onSectionFocused }: { focusSection?: string | null; onSectionFocused?: () => void }) {
  const { t } = useTranslation();
  const { user, session } = useAuth();
  const { data: policies } = usePolicySettings();
  const queryClient = useQueryClient();
  const { play: playSound } = useSoundEffects();
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [welcomeAirport, setWelcomeAirport] = useState<"bkk" | "samui" | null>(null);
  const [pendingLanded, setPendingLanded] = useState(false);
  // Landing confirmation dialog state
  const [landedDialogOpen, setLandedDialogOpen] = useState(false);
  const [landedBookingId, setLandedBookingId] = useState<string | null>(null);

  const { data: bookings } = useQuery({
    queryKey: ["guest-stay-summary-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, state, check_in, check_out, total_price, unit_id, arrival_details, units(name)")
        .eq("guest_id", user!.id)
        .in("state", ["inquiry", "soft_hold", "pending_approval", "pending_deposit", "confirmed", "checked_in"])
        .order("check_in", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data as BookingWithUnit[];
    },
  });

  const bookingIds = bookings?.map((b) => b.id) ?? [];

  const { data: payments } = useQuery({
    queryKey: ["guest-stay-summary-payments", bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("booking_id, amount, status, refund_amount")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: pickups } = useQuery({
    queryKey: ["guest-stay-summary-pickups", bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("airport_pickups" as any)
        .select("id, booking_id, status, driver_id, flight_number, international_flight_number, final_flight_confirmed, arrival_datetime, guest_landed_at, confirmed_airport, drivers(name, vehicle_type)")
        .in("booking_id", bookingIds) as any);
      if (error) throw error;
      return data as any[];
    },
  });

  // Flight tracking for guest's pickups (for airport cross-check)
  const pickupIds = (pickups ?? []).map((p: any) => p.id);
  const { data: flightMap } = useFlightTrackingBatch(pickupIds);

  const { data: deposits } = useQuery({
    queryKey: ["guest-stay-summary-deposits", bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_deposits")
        .select("booking_id, amount_held, status")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: guestDocs } = useQuery({
    queryKey: ["guest-stay-summary-docs", bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select("booking_id, verification_status")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data;
    },
  });

  // "I've Landed" mutation — now accepts confirmed airport
  const landedMutation = useMutation({
    mutationFn: async ({ bookingId, confirmed_airport }: { bookingId: string; confirmed_airport: string }) => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-landed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ booking_id: bookingId, confirmed_airport }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Failed to confirm landing");
      }
      return resp.json();
    },
    onSuccess: (data, { bookingId, confirmed_airport }) => {
      setLandedDialogOpen(false);
      setLandedBookingId(null);
      if (data.already) {
        toast.info(t("guestStay.actions.alreadyLanded"));
      } else {
        toast.success(t("guestStay.actions.landedSuccess"));
        playSound("landed");
        // Show arrival welcome dialog — use confirmed airport
        const airport = (confirmed_airport === "bkk" ? "bkk" : confirmed_airport === "usm" || confirmed_airport === "samui" ? "samui" : null) as "bkk" | "samui" | null;
        if (airport) {
          setWelcomeAirport(airport);
          setWelcomeDialogOpen(true);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["guest-stay-summary-pickups"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Helper: open the landing confirmation dialog instead of firing immediately
  const openLandedDialog = (bookingId: string) => {
    setLandedBookingId(bookingId);
    setLandedDialogOpen(true);
  };

  // Get flight/booking airport info for the dialog
  const landedBooking = bookings?.find((b) => b.id === landedBookingId);
  const landedPickup = (pickups ?? []).find((p: any) => p.booking_id === landedBookingId);
  const landedFlightTracking = landedPickup ? flightMap?.[landedPickup.id] : null;
  const landedFlightAirport = landedFlightTracking?.arrival_iata
    ? (landedFlightTracking.arrival_iata.toUpperCase() === "BKK" ? "bkk" as const
      : landedFlightTracking.arrival_iata.toUpperCase() === "USM" ? "samui" as const : null)
    : null;
  const landedBookingAirport = detectAirport(landedBooking);

  // Auto-trigger "I've Landed" when deep-linked from notification
  useEffect(() => {
    if (focusSection === "landed" && bookings?.length && pickups) {
      const eligibleBooking = bookings.find((b) => {
        const pickup = pickups.find((p: any) => p.booking_id === b.id);
        return pickup && !pickup.guest_landed_at && ["requested", "assigned", "confirmed"].includes(pickup.status);
      });
      if (eligibleBooking) {
        openLandedDialog(eligibleBooking.id);
      }
      onSectionFocused?.();
    }
  }, [focusSection, bookings, pickups]);

  // Scroll the guest to a specific block inside their booking card and flash it.
  // Falls back to a toast so a tap can never look like "nothing happened".
  const focusBookingBlock = (
    elementId: string,
    fallbackSelector: string,
    missingMessage: string,
    onFound?: () => void,
  ) => {
    const attempt = (n = 0) => {
      const el = document.getElementById(elementId) ?? document.querySelector(fallbackSelector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "rounded-md");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
        onFound?.();
      } else if (n < 12) {
        setTimeout(() => attempt(n + 1), 100);
      } else {
        toast.info(missingMessage);
      }
    };
    setTimeout(() => attempt(), 60);
  };

  const handleAction = (type: ActionType, bookingId: string) => {
    switch (type) {
      case "pay_deposit": {
        // Switch to the bookings tab, scroll the guest straight to the deposit
        // block for THIS booking, then actually start checkout — a tap on
        // "Pay Deposit" should pay, not just move the page.
        logGuestPortalEvent({
          event: "deposit_button_clicked",
          bookingId,
          component: "GuestStaySummary",
        });
        window.dispatchEvent(
          new CustomEvent("guest-portal-action", { detail: { tab: "bookings", section: "deposit" } }),
        );
        focusBookingBlock(
          `deposit-${bookingId}`,
          `[data-deposit-section="${bookingId}"]`,
          t(
            "guestStay.actions.depositNotFound",
            "We couldn't find a deposit due on this booking. Please contact the front desk.",
          ),
          () => {
            logGuestPortalEvent({
              event: "deposit_section_scrolled",
              bookingId,
              status: "ok",
              component: "GuestStaySummary",
            });
            window.dispatchEvent(
              new CustomEvent("guest-start-deposit-checkout", { detail: { bookingId } }),
            );
          },
        );
        break;
      }
      case "upload_id":
        // The ID upload lives inside the booking card on the Bookings tab —
        // NOT the Pre-Arrival tab (which only exists for confirmed bookings).
        logGuestPortalEvent({
          event: "id_upload_button_clicked",
          bookingId,
          component: "GuestStaySummary",
        });
        window.dispatchEvent(
          new CustomEvent("guest-portal-action", { detail: { tab: "bookings", section: "documents" } }),
        );
        focusBookingBlock(
          `documents-${bookingId}`,
          `[data-documents-section="${bookingId}"]`,
          t(
            "guestStay.actions.uploadNotAvailable",
            "ID upload isn't available for this booking yet. Please contact the front desk.",
          ),
          () => {
            logGuestPortalEvent({
              event: "id_upload_section_scrolled",
              bookingId,
              status: "ok",
              component: "GuestStaySummary",
            });
            window.dispatchEvent(
              new CustomEvent("guest-open-id-picker", { detail: { bookingId } }),
            );
          },
        );
        break;


      case "landed":
        openLandedDialog(bookingId);
        break;
      case "report_issue":
        window.dispatchEvent(new CustomEvent("guest-portal-action", { detail: { tab: "stay-support" } }));
        break;
      case "ask_ai":
        window.dispatchEvent(new CustomEvent("ask-kru-glitch", { detail: { question: "" } }));
        break;
      case "stay_essentials":
        window.dispatchEvent(new CustomEvent("ask-kru-glitch", { detail: { question: "Show me my stay essentials — WiFi, house rules, and emergency contacts." } }));
        break;
    }
  };

  // Find first checked-in booking's unit ID for essentials.
  // NOTE: this hook must run on every render — keep it ABOVE any early return,
  // otherwise React throws "Rendered more hooks than during the previous render".
  const checkedInBooking = bookings?.find((b) => b.state === "checked_in") ?? bookings?.find((b) => b.state === "confirmed");
  const { data: essentials } = useStayEssentials(checkedInBooking?.unit_id);

  if (!bookings?.length) return null;


  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Stay Essentials Card — visible when checked in or confirmed */}
      {essentials && checkedInBooking && (essentials.wifi_network || essentials.house_rules || essentials.emergency_phone) && (
        <Card className="border-primary/20 overflow-hidden">
          <CardContent className="p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
              <span className="font-semibold text-sm sm:text-base text-foreground">{t("guestStay.essentials.title", "Stay Essentials")}</span>
            </div>

            <div className="grid gap-2">
              {/* WiFi */}
              {essentials.wifi_network && (
                <div className="flex items-start gap-2 bg-success/5 rounded-lg p-2.5">
                  <Wifi className="h-3.5 w-3.5 text-[hsl(var(--success))] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{t("guestStay.essentials.wifi", "WiFi")}</p>
                    <p className="text-xs font-semibold">{essentials.wifi_network}</p>
                    {essentials.wifi_password && (
                      <p className="text-xs font-mono text-muted-foreground">{essentials.wifi_password}</p>
                    )}
                  </div>
                </div>
              )}

              {/* House Rules */}
              {essentials.house_rules && (
                <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-2.5">
                  <ScrollText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{t("guestStay.essentials.rules", "House Rules")}</p>
                    <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{essentials.house_rules}</p>
                  </div>
                </div>
              )}

              {/* Emergency Contact */}
              {essentials.emergency_phone && (
                <div className="flex items-start gap-2 bg-destructive/5 rounded-lg p-2.5">
                  <Phone className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{t("guestStay.essentials.emergency", "Emergency")}</p>
                    <p className="text-xs font-semibold">{essentials.emergency_name}</p>
                    <p className="text-xs text-muted-foreground">{essentials.emergency_phone}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {bookings.map((booking) => {
        const bPayments = (payments ?? []).filter((p) => p.booking_id === booking.id);
        const { outstanding } = calculateOutstanding(
          booking.total_price,
          bPayments.map((p) => ({ amount: p.amount, status: p.status, refund_amount: p.refund_amount }))
        );
        const pickup = (pickups ?? []).find((p: any) => p.booking_id === booking.id);
        const deposit = (deposits ?? []).find((d) => d.booking_id === booking.id);
        const bDocs = (guestDocs ?? []).filter((d) => d.booking_id === booking.id);
        const edge = getEdgeFlags(booking, outstanding, pickup, policies ?? undefined);
        const stateInfo = STATE_CONFIG[booking.state] ?? STATE_CONFIG.inquiry;
        const StateIcon = stateInfo.icon;
        const nextStep = getNextStep(booking, outstanding, edge, t);
        const nights = differenceInDays(parseISO(booking.check_out), parseISO(booking.check_in));
        const actions = deriveActions(booking, outstanding, pickup, bDocs);

        const hasWarning = edge.depositOverdue || edge.checkinPassed;

        // Show landed confirmation instead of actions if already landed
        const alreadyLanded = pickup?.guest_landed_at;

        return (
          <Card key={booking.id} className={`overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${hasWarning ? "border-destructive/40" : "border-primary/20"}`}>
            <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              {/* Header: Unit + Status */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm sm:text-base text-foreground truncate">
                    {edge.missingUnit ? t("guestStay.unitNotAssigned") : (booking.units?.name ?? "—")}
                  </span>
                </div>
                <Badge className={`text-[10px] sm:text-xs shrink-0 ${stateInfo.variant}`}>
                  <StateIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                  {t(stateInfo.key)}
                </Badge>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="truncate">
                  {format(new Date(booking.check_in), "MMM d")}
                  <ArrowRight className="inline h-2.5 w-2.5 sm:h-3 sm:w-3 mx-0.5" />
                  {format(new Date(booking.check_out), "MMM d")}
                </span>
                <span className="text-[10px] sm:text-xs whitespace-nowrap">({t("guestStay.nights", { count: nights })})</span>
              </div>

              <Separator />

              {/* Status Row */}
              <div className="flex sm:grid sm:grid-cols-3 gap-3 sm:gap-2 text-[11px] sm:text-xs overflow-x-auto scrollbar-hide pb-0.5">
                <StatusPill
                  icon={<CreditCard className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />}
                  className={outstanding > 0 ? "text-warning-foreground font-medium" : booking.total_price ? "text-[hsl(var(--success))] font-medium" : "text-muted-foreground"}
                  text={outstanding > 0 ? t("guestStay.due", { amount: formatPrice(outstanding, policies, { decimals: 0 }) }) : booking.total_price ? t("guestStay.paidInFull") : t("guestStay.priceTBD")}
                />
                <StatusPill
                  icon={<Plane className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />}
                  className={
                    alreadyLanded
                      ? "text-[hsl(var(--success))] font-medium"
                      : pickup
                        ? (pickup.status === "confirmed" || pickup.status === "completed")
                          ? "text-[hsl(var(--success))] font-medium"
                          : pickup.status === "assigned" ? "text-primary font-medium"
                          : edge.pickupPendingDriver ? "text-warning-foreground font-medium" : "text-muted-foreground"
                        : "text-muted-foreground"
                  }
                  text={
                    alreadyLanded
                      ? t("guestStay.landed")
                      : pickup
                        ? (pickup.status === "confirmed" || pickup.status === "completed")
                          ? `${t("guestStay.pickupConfirmed")}${pickup.drivers?.name ? ` — ${pickup.drivers.name}` : ""}`
                          : pickup.status === "assigned"
                            ? `${t("guestStay.pickupAssigned")}${pickup.drivers?.name ? ` — ${pickup.drivers.name}` : ""}`
                            : edge.pickupPendingDriver
                              ? t("guestStay.pickupPendingDriver")
                              : t("guestStay.pickupRequested")
                        : t("guestStay.noPickup")
                  }
                />
                {(String(policies?.find((p) => p.key === "security_deposit_required")?.value) === "true" || deposit) && (
                  <StatusPill
                    icon={<Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />}
                    className={
                      deposit
                        ? deposit.status === "released" ? "text-[hsl(var(--success))] font-medium"
                          : deposit.status === "held" ? "text-primary font-medium" : "text-muted-foreground"
                        : "text-muted-foreground"
                    }
                    text={
                      deposit
                        ? deposit.status === "held"
                          ? t("guestStay.depositHeld", { amount: formatPrice(deposit.amount_held, policies, { decimals: 0 }) })
                          : deposit.status === "released" ? t("guestStay.depositReleased") : deposit.status
                        : t("guestStay.depositNone")
                    }
                  />
                )}
              </div>

              {/* Next Step */}
              {nextStep && (
                <>
                  <Separator />
                  <div className={`flex items-start gap-1.5 text-[11px] sm:text-xs ${hasWarning ? "text-destructive" : ""}`}>
                    {hasWarning
                      ? <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive shrink-0 mt-0.5" />
                      : <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0 mt-0.5" />
                    }
                    <span className={hasWarning ? "font-medium leading-tight" : "text-foreground/80 leading-tight"}>{nextStep}</span>
                  </div>
                </>
              )}

              {/* Context-based Action Buttons */}
              {actions.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {actions.map((action, idx) => {
                      const Icon = action.icon;
                      const isLanding = action.type === "landed" && landedMutation.isPending;
                      return (
                        <Button
                          key={action.type}
                          size="sm"
                          variant={action.variant ?? "default"}
                          className={`h-7 sm:h-8 text-[11px] sm:text-xs gap-1 sm:gap-1.5 animate-fade-up animate-stagger-${idx + 1}`}
                          disabled={isLanding}
                          onClick={() => handleAction(action.type, booking.id)}
                        >
                          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          {isLanding ? t("common.pleaseWait") : t(action.labelKey)}
                        </Button>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Arrival Welcome Card — shown for landed guests */}
      {bookings?.map((booking) => {
        const pickup = pickups?.find((p: any) => p.booking_id === booking.id);
        if (!pickup?.guest_landed_at) return null;
        const ft = pickup ? flightMap?.[pickup.id] : null;
        const airport = detectAirport(booking, ft, pickup?.confirmed_airport);
        if (!airport) return null;
        return <ArrivalWelcomeCard key={`welcome-${booking.id}`} airport={airport} compact />;
      })}

      {/* Landing Confirmation Dialog */}
      <LandedConfirmationDialog
        open={landedDialogOpen}
        onOpenChange={(v) => { setLandedDialogOpen(v); if (!v) setLandedBookingId(null); }}
        flightAirport={landedFlightAirport}
        bookingAirport={landedBookingAirport}
        flightNumber={landedPickup?.flight_number}
        internationalFlightNumber={(landedPickup as any)?.international_flight_number}
        pickupStatus={landedPickup?.status}
        isPending={landedMutation.isPending}
        onConfirm={(confirmedAirport) => {
          if (landedBookingId) {
            landedMutation.mutate({ bookingId: landedBookingId, confirmed_airport: confirmedAirport });
          }
        }}
      />

      {/* Arrival Welcome Dialog */}
      <ArrivalWelcomeDialog
        open={welcomeDialogOpen}
        onOpenChange={setWelcomeDialogOpen}
        airport={welcomeAirport}
      />
    </div>
  );
}

/** Inline status pill */
function StatusPill({ icon, text, className }: { icon: React.ReactNode; text: string; className: string }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
      {icon}
      <span className={className}>{text}</span>
    </div>
  );
}
