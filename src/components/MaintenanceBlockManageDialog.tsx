/**
 * MaintenanceBlockManageDialog
 * ---------------------------------------------------------------------------
 * Admin/manager path to review and clear a maintenance block from a room.
 *
 * Two safe outcomes, both remove the block and immediately restore availability:
 *   - "Mark resolved"  — the maintenance work is finished.
 *   - "Remove block"   — the block was created by mistake.
 *
 * Both write a `staff_audit_events` row (who, why, which unit, which dates) via
 * the log_staff_audit_event RPC before the row is deleted, so the trail survives
 * the delete. maintenance_blocks has no status column and is hard-delete by
 * design elsewhere in the platform, so we keep that behavior and log around it.
 */
import { useState } from "react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wrench, CalendarDays, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDeleteMaintenanceBlock, type MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";

interface Props {
  block: MaintenanceBlock | null;
  unitName?: string;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceBlockManageDialog({ block, unitName, canManage, onOpenChange }: Props) {
  const { toast } = useToast();
  const del = useDeleteMaintenanceBlock();
  const [note, setNote] = useState("");
  const [confirmMode, setConfirmMode] = useState<null | "resolved" | "removed">(null);

  const close = () => { setNote(""); setConfirmMode(null); onOpenChange(false); };

  const clearBlock = async (mode: "resolved" | "removed") => {
    if (!block) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Log first — the audit row must outlive the deleted block.
      await supabase.rpc("log_staff_audit_event", {
        _event_type: mode === "resolved"
          ? "maintenance_block.resolved"
          : "maintenance_block.removed",
        _severity: "info",
        _actor_id: user?.id ?? null,
        _reason: note.trim() || (mode === "resolved"
          ? "Maintenance completed — room returned to availability"
          : "Maintenance block removed by staff"),
        _metadata: {
          maintenance_block_id: block.id,
          unit_id: block.unit_id,
          unit_name: unitName ?? null,
          start_date: block.start_date,
          end_date: block.end_date,
          original_reason: block.reason,
          outcome: mode,
        },
      });

      await del.mutateAsync(block.id);
      toast({
        title: mode === "resolved" ? "Marked resolved" : "Block removed",
        description: `${unitName ?? "Room"} is available again for ${block.start_date} – ${block.end_date}.`,
      });
      close();
    } catch (err: any) {
      toast({ title: "Could not clear block", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Dialog open={!!block && !confirmMode} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-destructive" /> Maintenance block
            </DialogTitle>
          </DialogHeader>

          {block && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <p className="font-medium">{unitName ?? "Room"}</p>
                <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {format(new Date(block.start_date), "MMM d, yyyy")} – {format(new Date(block.end_date), "MMM d, yyyy")}
                </p>
                {block.reason && <p className="text-xs italic text-muted-foreground">{block.reason}</p>}
              </div>

              <p className="text-xs text-muted-foreground">
                This room is not bookable for these dates. Clearing the block makes it
                available again straight away.
              </p>

              {canManage ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Note (optional — saved to the audit trail)</Label>
                    <Textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Aircon fixed, room cleaned"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => setConfirmMode("resolved")} disabled={del.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark resolved
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmMode("removed")} disabled={del.isPending}>
                      <Trash2 className="h-4 w-4 mr-1.5" /> Remove block (created by mistake)
                    </Button>
                    <Button variant="ghost" onClick={close}>Close</Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only an admin or manager can clear a maintenance block.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmMode} onOpenChange={(o) => { if (!o) setConfirmMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "resolved" ? "Mark maintenance resolved?" : "Remove this maintenance block?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Removing this maintenance block will make the room available again for these dates.
              This is recorded in the audit trail with your name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep block</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmMode && clearBlock(confirmMode)}>
              {confirmMode === "resolved" ? "Mark resolved" : "Remove block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
