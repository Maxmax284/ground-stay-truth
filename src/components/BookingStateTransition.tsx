import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { calculateRefund } from "@/lib/refundCalculator";
import {
  getValidTransitions,
  getAllTransitions,
  STATE_LABELS,
  type BookingState,
} from "@/lib/bookingStateMachine";
import { AlertTriangle, ShieldAlert, DollarSign } from "lucide-react";

interface BookingStateTransitionProps {
  bookingId: string;
  currentState: BookingState;
  isAdmin: boolean;
  checkInDate?: string;
  totalPrice?: number | null;
}

export function BookingStateTransition({ bookingId, currentState, isAdmin, checkInDate, totalPrice }: BookingStateTransitionProps) {
  const { toast } = useToast();
  const { role } = useAuth();
  const transition = useTransitionBookingState();
  const { data: documents } = useGuestDocuments(bookingId);
  const { data: policies } = usePolicySettings();

  const [adminOverride, setAdminOverride] = useState(false);
  const [targetState, setTargetState] = useState<BookingState | "">("");
  const [reason, setReason] = useState("");

  const canOverride = permissions.canAdminOverride(role);
  const canCheckIn = permissions.canCompleteCheckIn(role);
  const canCheckOut = permissions.canCompleteCheckOut(role);

  const hasDocuments = (documents?.length ?? 0) > 0;

  // Refund calculation when cancelling
  const refundInfo = useMemo(() => {
    if (targetState !== "cancelled" || !checkInDate || !policies) return null;
    return calculateRefund(checkInDate, totalPrice ?? null, policies);
  }, [targetState, checkInDate, totalPrice, policies]);

  // Get valid transitions then filter by role authority
  const rawTransitions = adminOverride
    ? getAllTransitions(currentState)
    : getValidTransitions(currentState);

  const validStates = rawTransitions.filter((s) => {
    if (s === "checked_in" && !canCheckIn) return false;
    if (s === "completed" && !canCheckOut) return false;
    return true;
  });

  if (!permissions.canTransitionState(role)) return null;
  if (validStates.length === 0 && !canOverride) return null;

  // Check-in blocked without documents (unless admin override)
  const checkInBlocked = targetState === "checked_in" && !hasDocuments && !adminOverride;

  const handleTransition = async () => {
    if (!targetState) return;
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for this transition.", variant: "destructive" });
      return;
    }
    if (checkInBlocked) {
      toast({ title: "Documents required", description: "Upload ID documents before completing check-in.", variant: "destructive" });
      return;
    }

    try {
      const reasonText = [
        adminOverride ? "[ADMIN OVERRIDE]" : "",
        reason,
        refundInfo ? `[Refund: ${refundInfo.label}${refundInfo.refundAmount != null ? ` — $${refundInfo.refundAmount.toFixed(2)}` : ""}]` : "",
      ].filter(Boolean).join(" ");

      await transition.mutateAsync({
        bookingId,
        fromState: currentState,
        toState: targetState as BookingState,
        reason: reasonText,
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
        {canOverride && validStates.length === 0 && !adminOverride && (
          <p className="text-xs text-muted-foreground">No standard transitions — use override</p>
        )}
        {canOverride && (
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

          {/* Check-in document warning */}
          {targetState === "checked_in" && !hasDocuments && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>ID documents must be uploaded before check-in can be completed.</span>
            </div>
          )}

          {/* Refund info when cancelling */}
          {refundInfo && (
            <div className={`flex items-start gap-2 text-sm rounded-md p-3 ${
              refundInfo.tier === "free" ? "bg-success/10 text-[hsl(var(--success))]"
              : refundInfo.tier === "partial" ? "bg-warning/10 text-warning-foreground"
              : "bg-destructive/10 text-destructive"
            }`}>
              <DollarSign className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{refundInfo.label}</p>
                {refundInfo.refundAmount != null && (
                  <p className="text-xs mt-1">
                    Refund amount: <strong>${refundInfo.refundAmount.toFixed(2)}</strong>
                    {totalPrice != null && ` of $${totalPrice.toFixed(2)} total`}
                  </p>
                )}
              </div>
            </div>
          )}

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
            disabled={!targetState || !reason.trim() || transition.isPending || checkInBlocked}
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
