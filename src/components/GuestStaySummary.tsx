import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { isPaymentReceived, calculateOutstanding } from "@/lib/paymentTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays, CreditCard, Plane, Shield, ArrowRight, CheckCircle2,
  Clock, AlertCircle, MapPin,
} from "lucide-react";
import { format, differenceInDays, isAfter, isBefore, isToday } from "date-fns";

interface BookingWithUnit {
  id: string;
  state: string;
  check_in: string;
  check_out: string;
  total_price: number | null;
  unit_id: string;
  units?: { name: string } | null;
}

const STATE_LABELS: Record<string, { label: string; variant: string; icon: typeof CheckCircle2 }> = {
  inquiry: { label: "Inquiry Sent", variant: "bg-muted text-muted-foreground", icon: Clock },
  soft_hold: { label: "Soft Hold", variant: "bg-muted text-muted-foreground", icon: Clock },
  pending_approval: { label: "Awaiting Approval", variant: "bg-warning/15 text-warning-foreground", icon: Clock },
  pending_deposit: { label: "Deposit Required", variant: "bg-warning/15 text-warning-foreground", icon: AlertCircle },
  confirmed: { label: "Confirmed", variant: "bg-success/15 text-[hsl(var(--success))]", icon: CheckCircle2 },
  checked_in: { label: "Checked In", variant: "bg-primary/15 text-primary", icon: CheckCircle2 },
};

function getNextStep(booking: BookingWithUnit, outstanding: number, pickupStatus: string | null): string {
  switch (booking.state) {
    case "inquiry":
    case "soft_hold":
      return "Waiting for staff to review your request.";
    case "pending_approval":
      return "Your booking is being reviewed. You'll hear back soon.";
    case "pending_deposit":
      return outstanding > 0 ? "Pay your deposit to confirm this booking." : "Deposit payment is being processed.";
    case "confirmed": {
      const daysUntil = differenceInDays(new Date(booking.check_in), new Date());
      if (daysUntil <= 0) return "Check-in is today! Head to the front desk.";
      if (daysUntil <= 3) return `Check-in is in ${daysUntil} day${daysUntil > 1 ? "s" : ""}. Make sure your pre-arrival checklist is complete.`;
      return `You're all set. Check-in is ${format(new Date(booking.check_in), "MMM d")}.`;
    }
    case "checked_in":
      return outstanding > 0
        ? "You have an outstanding balance. Please settle before checkout."
        : `Enjoy your stay! Checkout is ${format(new Date(booking.check_out), "MMM d")}.`;
    default:
      return "";
  }
}

export function GuestStaySummary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: policies } = usePolicySettings();

  // Fetch active/upcoming bookings
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

  // Fetch payments, pickups, deposits in parallel
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
    <div className="space-y-3">
      {bookings.map((booking) => {
        const bPayments = (payments ?? []).filter((p) => p.booking_id === booking.id);
        const { totalPaid, outstanding } = calculateOutstanding(
          booking.total_price,
          bPayments.map((p) => ({ amount: p.amount, status: p.status, refund_amount: p.refund_amount }))
        );
        const pickup = (pickups ?? []).find((p: any) => p.booking_id === booking.id);
        const deposit = (deposits ?? []).find((d) => d.booking_id === booking.id);
        const stateInfo = STATE_LABELS[booking.state] ?? STATE_LABELS.inquiry;
        const StateIcon = stateInfo.icon;
        const nextStep = getNextStep(booking, outstanding, pickup?.status ?? null);

        return (
          <Card key={booking.id} className="overflow-hidden border-primary/20">
            <CardContent className="p-4 space-y-3">
              {/* Header: Unit + Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate">
                    {booking.units?.name ?? "—"}
                  </span>
                </div>
                <Badge className={`text-xs shrink-0 ${stateInfo.variant}`}>
                  <StateIcon className="h-3 w-3 mr-1" />
                  {stateInfo.label}
                </Badge>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>{format(new Date(booking.check_in), "MMM d")} <ArrowRight className="inline h-3 w-3" /> {format(new Date(booking.check_out), "MMM d, yyyy")}</span>
                <span className="text-xs">({differenceInDays(new Date(booking.check_out), new Date(booking.check_in))} nights)</span>
              </div>

              <Separator />

              {/* Status Row: Payment + Pickup + Deposit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* Payment */}
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {outstanding > 0 ? (
                    <span className="text-warning-foreground font-medium">
                      {formatPrice(outstanding, policies, { decimals: 0 })} due
                    </span>
                  ) : booking.total_price ? (
                    <span className="text-[hsl(var(--success))] font-medium">Paid in full</span>
                  ) : (
                    <span className="text-muted-foreground">Price TBD</span>
                  )}
                </div>

                {/* Pickup */}
                <div className="flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {pickup ? (
                    <span className={pickup.status === "confirmed" || pickup.status === "completed"
                      ? "text-[hsl(var(--success))] font-medium"
                      : pickup.status === "assigned"
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }>
                      {pickup.status === "confirmed" || pickup.status === "completed"
                        ? `Confirmed${pickup.drivers?.name ? ` — ${pickup.drivers.name}` : ""}`
                        : pickup.status === "assigned"
                          ? `Assigned${pickup.drivers?.name ? ` — ${pickup.drivers.name}` : ""}`
                          : "Requested"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No pickup</span>
                  )}
                </div>

                {/* Security Deposit */}
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {deposit ? (
                    <span className={deposit.status === "released"
                      ? "text-[hsl(var(--success))] font-medium"
                      : deposit.status === "held"
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }>
                      {deposit.status === "held"
                        ? `${formatPrice(deposit.amount_held, policies, { decimals: 0 })} held`
                        : deposit.status === "released"
                          ? "Released"
                          : deposit.status}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </div>
              </div>

              {/* Next Step */}
              {nextStep && (
                <>
                  <Separator />
                  <div className="flex items-start gap-2 text-xs">
                    <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground/80">{nextStep}</span>
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
