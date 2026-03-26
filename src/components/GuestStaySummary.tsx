import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { calculateOutstanding } from "@/lib/paymentTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays, CreditCard, Plane, Shield, ArrowRight, CheckCircle2,
  Clock, AlertCircle, MapPin,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface BookingWithUnit {
  id: string;
  state: string;
  check_in: string;
  check_out: string;
  total_price: number | null;
  unit_id: string;
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

function useNextStep(booking: BookingWithUnit, outstanding: number, t: (k: string, opts?: any) => string): string {
  switch (booking.state) {
    case "inquiry":
    case "soft_hold":
      return t("guestStay.waitingReview");
    case "pending_approval":
      return t("guestStay.beingReviewed");
    case "pending_deposit":
      return outstanding > 0 ? t("guestStay.payDeposit") : t("guestStay.depositProcessing");
    case "confirmed": {
      const daysUntil = differenceInDays(new Date(booking.check_in), new Date());
      if (daysUntil <= 0) return t("guestStay.checkinToday");
      if (daysUntil <= 3) return t("guestStay.checkinSoon", { days: daysUntil });
      return t("guestStay.allSet", { date: format(new Date(booking.check_in), "MMM d") });
    }
    case "checked_in":
      return outstanding > 0
        ? t("guestStay.outstandingBalance")
        : t("guestStay.enjoyStay", { date: format(new Date(booking.check_out), "MMM d") });
    default:
      return "";
  }
}

export function GuestStaySummary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: policies } = usePolicySettings();

  const { data: bookings } = useQuery({
    queryKey: ["guest-stay-summary-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, state, check_in, check_out, total_price, unit_id, units(name)")
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
        .select("booking_id, status, driver_id, flight_number, arrival_datetime, drivers(name, vehicle_type)")
        .in("booking_id", bookingIds) as any);
      if (error) throw error;
      return data as any[];
    },
  });

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

  if (!bookings?.length) return null;

  return (
    <div className="space-y-2 sm:space-y-3">
      {bookings.map((booking) => {
        const bPayments = (payments ?? []).filter((p) => p.booking_id === booking.id);
        const { outstanding } = calculateOutstanding(
          booking.total_price,
          bPayments.map((p) => ({ amount: p.amount, status: p.status, refund_amount: p.refund_amount }))
        );
        const pickup = (pickups ?? []).find((p: any) => p.booking_id === booking.id);
        const deposit = (deposits ?? []).find((d) => d.booking_id === booking.id);
        const stateInfo = STATE_CONFIG[booking.state] ?? STATE_CONFIG.inquiry;
        const StateIcon = stateInfo.icon;
        const nextStep = useNextStep(booking, outstanding, t);
        const nights = differenceInDays(new Date(booking.check_out), new Date(booking.check_in));

        return (
          <Card key={booking.id} className="overflow-hidden border-primary/20">
            <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              {/* Header: Unit + Status — single row, compact on mobile */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm sm:text-base text-foreground truncate">
                    {booking.units?.name ?? "—"}
                  </span>
                </div>
                <Badge className={`text-[10px] sm:text-xs shrink-0 ${stateInfo.variant}`}>
                  <StateIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                  {t(stateInfo.key)}
                </Badge>
              </div>

              {/* Dates — compact inline */}
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

              {/* Status Row: horizontal scroll on mobile, grid on desktop */}
              <div className="flex sm:grid sm:grid-cols-3 gap-3 sm:gap-2 text-[11px] sm:text-xs overflow-x-auto scrollbar-hide pb-0.5">
                <StatusPill
                  icon={<CreditCard className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />}
                  className={outstanding > 0 ? "text-warning-foreground font-medium" : booking.total_price ? "text-[hsl(var(--success))] font-medium" : "text-muted-foreground"}
                  text={outstanding > 0 ? t("guestStay.due", { amount: formatPrice(outstanding, policies, { decimals: 0 }) }) : booking.total_price ? t("guestStay.paidInFull") : t("guestStay.priceTBD")}
                />
                <StatusPill
                  icon={<Plane className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />}
                  className={
                    pickup
                      ? (pickup.status === "confirmed" || pickup.status === "completed")
                        ? "text-[hsl(var(--success))] font-medium"
                        : pickup.status === "assigned" ? "text-primary font-medium" : "text-muted-foreground"
                      : "text-muted-foreground"
                  }
                  text={
                    pickup
                      ? (pickup.status === "confirmed" || pickup.status === "completed")
                        ? `${t("guestStay.pickupConfirmed")}${pickup.drivers?.name ? ` — ${pickup.drivers.name}` : ""}`
                        : pickup.status === "assigned"
                          ? `${t("guestStay.pickupAssigned")}${pickup.drivers?.name ? ` — ${pickup.drivers.name}` : ""}`
                          : t("guestStay.pickupRequested")
                      : t("guestStay.noPickup")
                  }
                />
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
              </div>

              {/* Next Step — compact */}
              {nextStep && (
                <>
                  <Separator />
                  <div className="flex items-start gap-1.5 text-[11px] sm:text-xs">
                    <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground/80 leading-tight">{nextStep}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Inline status pill — prevents text wrapping on mobile */
function StatusPill({ icon, text, className }: { icon: React.ReactNode; text: string; className: string }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
      {icon}
      <span className={className}>{text}</span>
    </div>
  );
}
