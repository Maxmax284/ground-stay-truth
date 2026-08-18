/**
 * OG backfill worklist — stays that already started but still have no money
 * or arrival recorded in the platform.
 *
 * These are the bookings created before CampStay existed. The state machine is
 * correct to hold them in `pending_deposit`; what's missing is the human
 * backfill. This card is the staff worklist: one row per booking, with the
 * single next action attached.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Banknote, ChevronRight, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { useMarkArrived } from "@/hooks/useFrontDesk";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { QuickOfflinePaymentDialog } from "./QuickOfflinePaymentDialog";
import {
  isBackfillCandidate,
  nextBackfillAction,
  BACKFILL_ACTION_LABELS,
  outstandingFor,
  type BackfillCandidate,
} from "@/lib/backfillWorklist";
import { toast } from "sonner";
import { CAMP_TIMEZONE } from "@/lib/timezone";

/** Today's date in camp (Asia/Bangkok) time as YYYY-MM-DD. */
function campToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAMP_TIMEZONE }).format(new Date());
}

type Row = BackfillCandidate & { raw: any };

export function BackfillWorklistCard({ onOpenBooking }: { onOpenBooking?: (id: string) => void }) {
  const today = campToday();
  const [payBooking, setPayBooking] = useState<Row | null>(null);
  const markArrived = useMarkArrived();
  const transition = useTransitionBookingState();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["backfill-worklist", today],
    queryFn: async () => {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .lte("check_in", today)
        .in("state", ["inquiry", "soft_hold", "pending_approval", "pending_deposit", "confirmed"])
        .order("check_in", { ascending: true });
      if (error) throw error;

      const ids = (bookings ?? []).map((b: any) => b.id);
      let paidById: Record<string, number> = {};
      if (ids.length) {
        const { data: payments } = await supabase
          .from("payments")
          .select("booking_id, amount, status")
          .in("booking_id", ids);
        paidById = (payments ?? []).reduce((acc: Record<string, number>, p: any) => {
          if (p.status !== "paid") return acc;
          acc[p.booking_id] = (acc[p.booking_id] ?? 0) + Number(p.amount ?? 0);
          return acc;
        }, {});
      }

      return (bookings ?? []).map((b: any) => ({
        id: b.id,
        state: b.state,
        check_in: b.check_in,
        check_out: b.check_out,
        arrived_at: b.arrived_at,
        pay_on_arrival: b.pay_on_arrival,
        total_price: b.total_price,
        paid: paidById[b.id] ?? 0,
        raw: b,
      })) as Row[];
    },
  });

  const rows = useMemo(
    () => (data ?? []).filter((r) => isBackfillCandidate(r, today)),
    [data, today],
  );

  const handleArrived = async (row: Row) => {
    try {
      await markArrived.mutateAsync({ bookingId: row.id, note: "Backfilled arrival" });
      refetch();
    } catch { /* hook toasts */ }
  };

  const handleCheckIn = async (row: Row) => {
    try {
      await transition.mutateAsync({
        bookingId: row.id,
        fromState: row.state as any,
        toState: "checked_in" as any,
        reason: "Backfilled check-in — guest already on property",
      });
      toast.success("Checked in");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not check the guest in");
    }
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!rows.length) return null;

  return (
    <>
      <Card className="border-[hsl(var(--warning,38_92%_50%))]/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Needs backfill ({rows.length})
          </CardTitle>
          <CardDescription>
            Stays that already started but have no recorded payment or arrival. Record the
            money reality first, then mark arrived and check in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => {
            const action = nextBackfillAction(row);
            return (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {resolveGuestDisplayName(row.raw)}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {row.raw.units?.name ?? "—"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {format(new Date(row.check_in), "MMM d")} – {format(new Date(row.check_out), "MMM d")}
                    {" · "}
                    {BACKFILL_ACTION_LABELS[action]}
                    {outstandingFor(row) > 0 && ` · ${formatPrice(outstandingFor(row))} due`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {action === "record_payment" && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPayBooking(row)}>
                      <Banknote className="mr-1 h-3 w-3" /> Record payment
                    </Button>
                  )}
                  {action === "mark_arrived" && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleArrived(row)} disabled={markArrived.isPending}>
                      <UserCheck className="mr-1 h-3 w-3" /> Mark arrived
                    </Button>
                  )}
                  {action === "check_in" && (
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleCheckIn(row)} disabled={transition.isPending}>
                      Check in
                    </Button>
                  )}
                  {onOpenBooking && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpenBooking(row.id)}>
                      Open <ChevronRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <QuickOfflinePaymentDialog
        booking={payBooking ? { id: payBooking.id, total_price: payBooking.total_price, pay_on_arrival: payBooking.pay_on_arrival } : null}
        paid={payBooking?.paid ?? 0}
        onClose={() => { setPayBooking(null); refetch(); }}
      />
    </>
  );
}
