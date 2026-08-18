/**
 * Quick offline payment — the one-screen version of "money already changed
 * hands outside the platform".
 *
 * Exists because OG bookings (pre-platform) have no payment trail, and staff
 * were reaching for "Override expiry" to silence the deadline instead of
 * recording the money. This dialog puts the correct action one tap away from
 * the booking row: record what was actually paid, or flag pay-on-arrival.
 */
import { useState } from "react";
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
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";

interface Props {
  booking: {
    id: string;
    total_price?: number | null;
    pay_on_arrival?: boolean | null;
  } | null;
  paid?: number;
  onClose: () => void;
}

export function QuickOfflinePaymentDialog({ booking, paid = 0, onClose }: Props) {
  const outstanding = Math.max(0, Number(booking?.total_price ?? 0) - paid);
  const [amount, setAmount] = useState<string>(outstanding ? String(outstanding) : "");
  const [method, setMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("Backfilled — payment taken before platform");
  const createPayment = useCreatePayment();
  const setPayOnArrival = useSetPayOnArrival();

  if (!booking) return null;

  const submit = async () => {
    const value = Number(amount);
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
        payment_type: "deposit",
      });
      toast.success("Payment recorded");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record the payment");
    }
  };

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
            Money taken outside the platform (cash, bank transfer, OTA). Outstanding:{" "}
            {formatPrice(outstanding)}
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
