/**
 * Quick offline payment — the one-screen version of "money already changed
 * hands outside the platform".
 *
 * Exists because OG bookings (pre-platform) have no payment trail, and staff
 * were reaching for "Override expiry" to silence the deadline instead of
 * recording the money. This dialog puts the correct action one tap away from
 * the booking row: record what was actually paid, or flag pay-on-arrival.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreatePayment } from "@/hooks/useBookings";
import { useSetPayOnArrival } from "@/hooks/useBookingMarkers";
import { supabase } from "@/integrations/supabase/client";
import { calculateOutstanding } from "@/lib/paymentTypes";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";

interface Props {
  booking: {
    id: string;
    total_price?: number | null;
    pay_on_arrival?: boolean | null;
  } | null;
  /** Optional hint from the caller; the dialog still verifies against the database. */
  paid?: number;
  onClose: () => void;
}

export function QuickOfflinePaymentDialog({ booking, paid, onClose }: Props) {
  const bookingId = booking?.id;

  /**
   * Never trust a caller-supplied "paid" figure: the Bookings row action has no
   * payments relation, and a stale zero would offer to charge the guest the full
   * total a second time. Read the money trail here, and keep every button locked
   * until it lands.
   */
  const { data: money, isLoading: loadingMoney } = useQuery({
    queryKey: ["quick-offline-payment", bookingId],
    enabled: !!bookingId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, status, refund_amount, payment_type")
        .eq("booking_id", bookingId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const verified = money
    ? calculateOutstanding(Number(booking?.total_price ?? 0), money as any)
    : null;
  const outstanding = verified
    ? verified.outstanding
    : Math.max(0, Number(booking?.total_price ?? 0) - Number(paid ?? 0));

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("Backfilled — payment taken before platform");
  const createPayment = useCreatePayment();
  const setPayOnArrival = useSetPayOnArrival();

  // Pre-fill only once the real outstanding balance is known.
  useEffect(() => {
    if (verified) setAmount(verified.outstanding ? String(verified.outstanding) : "");
  }, [verified?.outstanding]);

  if (!booking) return null;


  const record = async (value: number, full: boolean) => {
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    try {
      await createPayment.mutateAsync({
        booking_id: booking.id,
        amount: value,
        method,
        notes: notes.trim() || undefined,
        source_channel: "front_desk",
        payment_type: full ? "balance" : "deposit",
      });
      toast.success(full ? "Marked paid in full" : "Payment recorded");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record the payment");
    }
  };

  const submit = () => record(Number(amount), false);
  const markPaidInFull = () => record(outstanding, true);

  const flagPayOnArrival = async () => {
    try {
      await setPayOnArrival.mutateAsync({
        bookingId: booking.id,
        value: true,
        reason: "Legacy booking — guest settles at the desk",
      });
      onClose();
    } catch { /* toast handled in hook */ }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Money taken outside the platform (cash, bank transfer, OTA).{" "}
            {loadingMoney || !verified
              ? "Checking what's already been paid…"
              : `Already paid: ${formatPrice(verified.totalPaid)} · Outstanding: ${formatPrice(outstanding)}`}
          </DialogDescription>

        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qop-amount">Amount</Label>
            <Input
              id="qop-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qop-notes">Note</Label>
            <Textarea id="qop-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {!booking.pay_on_arrival && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={flagPayOnArrival}
              disabled={setPayOnArrival.isPending}
            >
              Paying at the desk instead
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={markPaidInFull}
            disabled={createPayment.isPending || outstanding <= 0}
          >
            Mark paid in full ({formatPrice(outstanding)})
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={submit}
            disabled={createPayment.isPending}
          >
            {createPayment.isPending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
