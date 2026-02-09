import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTransitionBookingState } from "@/hooks/useBookings";
import {
  getValidTransitions,
  getAllTransitions,
  STATE_LABELS,
  type BookingState,
} from "@/lib/bookingStateMachine";

interface BookingStateTransitionProps {
  bookingId: string;
  currentState: BookingState;
  isAdmin: boolean;
}

export function BookingStateTransition({ bookingId, currentState, isAdmin }: BookingStateTransitionProps) {
  const { toast } = useToast();
  const transition = useTransitionBookingState();

  const [adminOverride, setAdminOverride] = useState(false);
  const [targetState, setTargetState] = useState<BookingState | "">("");
  const [reason, setReason] = useState("");

  const validStates = adminOverride
    ? getAllTransitions(currentState)
    : getValidTransitions(currentState);

  if (validStates.length === 0 && !isAdmin) return null;

  const handleTransition = async () => {
    if (!targetState) return;
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for this transition.", variant: "destructive" });
      return;
    }

    try {
      await transition.mutateAsync({
        bookingId,
        fromState: currentState,
        toState: targetState as BookingState,
        reason: `${adminOverride ? "[ADMIN OVERRIDE] " : ""}${reason}`,
      });
      toast({ title: "State updated", description: `Booking moved to ${STATE_LABELS[targetState as BookingState]}` });
      setTargetState("");
      setReason("");
      setAdminOverride(false);
    } catch (err: any) {
      toast({ title: "Transition failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Change State</h4>
        {isAdmin && validStates.length === 0 && !adminOverride && (
          <p className="text-xs text-muted-foreground">No standard transitions — use override</p>
        )}
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Label htmlFor="admin-override" className="text-xs text-muted-foreground">Admin Override</Label>
            <Switch
              id="admin-override"
              checked={adminOverride}
              onCheckedChange={setAdminOverride}
            />
          </div>
        )}
      </div>

      {(validStates.length > 0) && (
        <>
          <Select value={targetState} onValueChange={(v) => setTargetState(v as BookingState)}>
            <SelectTrigger>
              <SelectValue placeholder="Select next state" />
            </SelectTrigger>
            <SelectContent>
              {validStates.map((s) => (
                <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <Label className="text-xs">Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for this transition…"
              rows={2}
            />
          </div>

          <Button
            onClick={handleTransition}
            disabled={!targetState || !reason.trim() || transition.isPending}
            size="sm"
            className="w-full"
          >
            {transition.isPending ? "Updating…" : "Confirm Transition"}
          </Button>
        </>
      )}
    </div>
  );
}
