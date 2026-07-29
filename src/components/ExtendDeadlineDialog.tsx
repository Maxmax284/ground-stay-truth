import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { useOverrideBookingDeadline } from "@/hooks/useBookingDeadlineOverride";
import type { BookingDeadlineInfo } from "@/lib/bookingDeadline";

const QUICK_HOURS = [6, 12, 24, 48, 72];

interface Props {
  bookingId: string | null;
  state?: string;
  info: BookingDeadlineInfo | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Staff-facing override for an expired (or soon-to-expire) hold / deposit
 * deadline. Plain English on purpose — pick how much extra time to give,
 * say why, done.
 */
export function ExtendDeadlineDialog({ bookingId, state, info, open, onOpenChange }: Props) {
  const [hours, setHours] = useState<number>(24);
  const [reason, setReason] = useState("");
  const override = useOverrideBookingDeadline();

  const submit = async (clear = false) => {
    if (!bookingId) return;
    if (!clear && !reason.trim()) {
      toast.error("Add a short reason — it goes in the staff log.");
      return;
    }
    try {
      await override.mutateAsync({
        bookingId,
        hours: clear ? null : hours,
        reason: reason.trim(),
        state,
      });
      toast.success(clear ? "Back on standard policy timing." : `Deadline extended ${hours}h.`);
      setReason("");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't update the deadline. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Extend hold deadline
          </DialogTitle>
          <DialogDescription>
            {info
              ? info.isExpired
                ? `This one ran out on ${format(info.deadline, "MMM d, HH:mm")}. Give it more time instead of letting it sit expired.`
                : `Current deadline: ${format(info.deadline, "MMM d, HH:mm")}.`
              : "Set a custom deadline for this booking."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Extra time from now</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_HOURS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  size="sm"
                  variant={hours === h ? "default" : "outline"}
                  onClick={() => setHours(h)}
                >
                  {h}h
                </Button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={720}
              value={hours}
              onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              New deadline: {format(new Date(Date.now() + hours * 3600_000), "MMM d, HH:mm")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline-reason" className="text-xs text-muted-foreground">Reason (logged)</Label>
            <Input
              id="deadline-reason"
              placeholder="Guest confirmed by WhatsApp, sending payment tonight"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {info?.source === "override" ? (
            <Button variant="ghost" onClick={() => submit(true)} disabled={override.isPending}>
              Clear override
            </Button>
          ) : <span />}
          <Button onClick={() => submit(false)} disabled={override.isPending}>
            {override.isPending ? "Saving…" : "Extend deadline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
