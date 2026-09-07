import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatCampDate } from "@/lib/timezone";
import { applyRoomMove, checkRoomMove, resolveBookingDates, swapBookingRooms, type MoveConflict } from "@/lib/roomMove";
import type { Unit } from "@/hooks/useUnits";

export interface MoveRoomBooking {
  id: string;
  unit_id: string | null;
  check_in: string;
  check_out: string;
  unitName?: string | null;
  guestName?: string | null;
}

interface MoveRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: MoveRoomBooking | null;
  units: Unit[];
  /** Drag-and-drop supplies the target room; the drawer lets staff pick one. */
  fixedTargetUnitId?: string | null;
  onMoved?: () => void;
}

const NONE = "__none__";

export function MoveRoomDialog({ open, onOpenChange, booking, units, fixedTargetUnitId, onMoved }: MoveRoomDialogProps) {
  const queryClient = useQueryClient();
  const [targetUnitId, setTargetUnitId] = useState<string>(NONE);
  const [reason, setReason] = useState("");
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<MoveConflict | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetUnitId(fixedTargetUnitId ?? NONE);
    setReason("");
    setConflict(null);
    setLoadError(null);
    setSwapping(false);
  }, [open, fixedTargetUnitId, booking?.id]);

  const dates = useMemo(() => resolveBookingDates(booking ?? undefined), [booking]);
  const targetUnit = units.find((u) => u.id === targetUnitId) ?? null;
  const selectable = useMemo(
    () => units.filter((u) => u.is_active && u.id !== booking?.unit_id),
    [units, booking?.unit_id]
  );

  // Availability is verified server-side against the booking's stored dates.
  useEffect(() => {
    if (!open || !booking || targetUnitId === NONE) return;
    let cancelled = false;
    setChecking(true);
    setConflict(null);
    setLoadError(null);
    checkRoomMove(booking.id, targetUnitId)
      .then((res) => {
        if (cancelled) return;
        setConflict(res.conflict ?? null);
        setLoadError(res.error ?? null);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, booking?.id, targetUnitId]);

  const refreshBoards = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["booking"] });
    queryClient.invalidateQueries({ queryKey: ["booking-segments"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["maintenance_blocks"] });
    queryClient.invalidateQueries({ queryKey: ["front-desk"] });
    queryClient.invalidateQueries({ queryKey: ["override-audit"] });
  };

  const handleSwap = async () => {
    if (!booking || !targetUnit || !conflict?.blockingBookingId) return;
    setSwapping(true);
    try {
      await swapBookingRooms({
        bookingId: booking.id,
        otherBookingId: conflict.blockingBookingId,
        reason: reason,
      });
      refreshBoards();
      toast({ title: `Rooms swapped. This booking is now in ${targetUnit.name}.` });
      onOpenChange(false);
      onMoved?.();
    } catch (e) {
      toast({ title: "Could not swap the two bookings", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSwapping(false);
    }
  };

  const handleConfirm = async () => {
    if (!booking || !targetUnit) return;
    setSaving(true);
    try {
      await applyRoomMove({
        bookingId: booking.id,
        fromUnitId: booking.unit_id,
        fromUnitName: booking.unitName ?? null,
        toUnitId: targetUnit.id,
        toUnitName: targetUnit.name,
        guestName: booking.guestName ?? null,
        reason,
        source: fixedTargetUnitId ? "calendar_drag_move" : "room_shuffle",
      });
      refreshBoards();
      toast({ title: `Booking moved to ${targetUnit.name}.` });
      onOpenChange(false);
      onMoved?.();
    } catch (e) {
      toast({ title: "Could not move booking", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const blocked = !dates || !!conflict || !!loadError || checking || targetUnitId === NONE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move booking?</DialogTitle>
          <DialogDescription>
            Only the room changes. Dates, guest, payments, documents and pickup stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span>{booking?.unitName ?? "Current room"}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{targetUnit?.name ?? "Select a room"}</span>
            </div>
            <p className="text-muted-foreground">
              Dates: {dates ? `${formatCampDate(dates.checkIn)} – ${formatCampDate(dates.checkOut)}` : "Unavailable"}
            </p>
            <p className="text-muted-foreground">Guest: {booking?.guestName ?? "—"}</p>
          </div>

          {!fixedTargetUnitId && (
            <div className="space-y-1.5">
              <Label>Move to room</Label>
              <Select value={targetUnitId} onValueChange={setTargetUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose a room</SelectItem>
                  {selectable.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="move-reason">Reason for move (optional)</Label>
            <Textarea
              id="move-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Freeing Room 12 for an extension."
              rows={2}
            />
          </div>

          {checking && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…
            </p>
          )}

          {(conflict || loadError || !dates) && !checking && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <p className="text-foreground">
                  {conflict?.message ??
                    loadError ??
                    "Could not move booking because the booking dates could not be loaded."}
                </p>
                {conflict?.detail && <p className="text-muted-foreground mt-0.5">{conflict.detail}</p>}
                {conflict?.blockingBookingId && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-muted-foreground">
                      Both stays can trade rooms instead: this booking takes {targetUnit?.name}, and that booking
                      takes {booking?.unitName ?? "this room"}.
                    </p>
                    <Button size="sm" variant="secondary" onClick={handleSwap} disabled={swapping || saving}>
                      {swapping && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Swap the two bookings
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || swapping}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={blocked || saving || swapping}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Confirm move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
