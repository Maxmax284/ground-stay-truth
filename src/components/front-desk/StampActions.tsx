/**
 * Stamp actions — the human tap behind each Front Desk ink stamp.
 * Every action is a deliberate staff click on an existing, audited path:
 *  - Passport: opens the booking so staff look at the ID before accepting it.
 *  - Immigration: confirms TM30 (same field as the booking's TM30 row).
 *  - Balance: records money through the offline payment recorder (server-checked).
 *  - Room: marks the linked cleaning task done (housekeeping audit trail).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateHousekeepingTask } from "@/hooks/useHousekeepingTasks";
import { canRecordOfflinePayment } from "@/lib/offlinePayments";
import { formatPrice } from "@/lib/currency";
import { QuickOfflinePaymentDialog } from "@/components/bookings/QuickOfflinePaymentDialog";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import type { DeskStampKey } from "./deskStamps";
import { toast } from "sonner";

export function useConfirmTm30() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data: row, error: readErr } = await supabase
        .from("bookings").select("arrival_details").eq("id", bookingId).maybeSingle();
      if (readErr) throw readErr;
      const current = ((row?.arrival_details as any) ?? {}) as Record<string, any>;
      const next = { ...current, tm30: { confirmed_at: new Date().toISOString(), confirmed_by: user?.id ?? null } };
      const { error } = await supabase.from("bookings").update({ arrival_details: next }).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["booking-tm30", id] });
      qc.invalidateQueries({ queryKey: ["front-desk"] });
      toast.success("TM30 confirmed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't confirm TM30"),
  });
}

export function StampAction({
  kind, booking, onOpen,
}: { kind: DeskStampKey; booking: FrontDeskBooking; onOpen: (id: string) => void }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const tm30 = useConfirmTm30();
  const clean = useUpdateHousekeepingTask();
  const [confirm, setConfirm] = useState<null | "tm30" | "room">(null);
  const [paying, setPaying] = useState(false);

  let button: JSX.Element | null = null;
  if (kind === "passport") {
    button = booking.docCount > 0
      ? <Button size="sm" variant="outline" onClick={() => onOpen(booking.id)}>Review ID &amp; ink</Button>
      : <Button size="sm" variant="outline" onClick={() => onOpen(booking.id)}>Open booking — no ID yet</Button>;
  } else if (kind === "immigration") {
    button = booking.tm30Filed ? null
      : <Button size="sm" onClick={() => setConfirm("tm30")} disabled={tm30.isPending}>Confirm TM30 filed</Button>;
  } else if (kind === "balance") {
    button = booking.outstanding <= 0 ? null
      : canRecordOfflinePayment(role ? [role] : [])
        ? <Button size="sm" onClick={() => setPaying(true)}>Settle {formatPrice(booking.outstanding)}</Button>
        : <span className="text-xs text-muted-foreground">Supervisor or manager records money</span>;
  } else if (kind === "room") {
    const t = booking.turnover;
    button = !t?.id || t.status === "completed" ? null
      : <Button size="sm" onClick={() => setConfirm("room")} disabled={clean.isPending}>Mark room cleaned</Button>;
  }
  if (!button) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border/60 pt-2 mt-1">
      {button}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "tm30" ? "Confirm TM30 is filed?" : "Mark room cleaned?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "tm30"
                ? "Only confirm once immigration has actually been notified. Your name is recorded."
                : "Only mark it once the room is actually dusted and set. Your name is recorded."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  if (confirm === "tm30") await tm30.mutateAsync(booking.id);
                  if (confirm === "room" && booking.turnover?.id) {
                    await clean.mutateAsync({ id: booking.turnover.id, status: "completed" });
                    qc.invalidateQueries({ queryKey: ["front-desk"] });
                    toast.success("Room marked cleaned");
                  }
                } catch (e: any) {
                  if (confirm === "room") toast.error(e?.message ?? "Couldn't update the room");
                }
                setConfirm(null);
              }}
            >
              Yes, confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {paying && (
        <QuickOfflinePaymentDialog
          booking={booking}
          defaultNote="Taken at the front desk"
          onClose={() => { setPaying(false); qc.invalidateQueries({ queryKey: ["front-desk"] }); }}
        />
      )}
    </div>
  );
}
