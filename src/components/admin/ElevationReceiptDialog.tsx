/**
 * ElevationReceiptDialog — close-out summary for a break-glass window.
 *
 * Shown on demand while a window is open, and offered automatically the moment
 * a window ends, so temporary admin authority always leaves a readable receipt
 * instead of only a raw audit table.
 */
import { FileText, KeyRound, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useElevationReceipt, humanizeActionType } from "@/hooks/useElevationReceipt";
import { describeOverrideChange, formatOverrideAttribution } from "@/lib/overrideAudit";
import { formatCampShort } from "@/lib/timezone";

interface ElevationReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grantId?: string | null;
  reason?: string | null;
  /** True when the window has already closed — changes the wording only. */
  closed?: boolean;
}

export function ElevationReceiptDialog({
  open,
  onOpenChange,
  grantId,
  reason,
  closed,
}: ElevationReceiptDialogProps) {
  const { data, isLoading, error } = useElevationReceipt(grantId, open);
  const entries = data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-warning" />
            {closed ? "Break-glass window closed" : "What this window has done"}
          </DialogTitle>
          <DialogDescription>
            {reason ? `Reason given: ${reason}. ` : ""}
            Every action below was taken with borrowed admin authority and is stored
            permanently in the audit log.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Reading the audit log…</p>}

        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Could not load the receipt. The actions are still recorded — check
            Monitoring Center → Overrides.
          </p>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing was changed during this window. Nothing to report.
          </p>
        )}

        {entries.length > 0 && (
          <ScrollArea className="max-h-[52vh] pr-3">
            <ol className="space-y-3">
              {entries.map((entry, index) => {
                const change = describeOverrideChange(entry);
                return (
                  <li key={entry.id} className="rounded-md border border-warning/40 bg-warning/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {index + 1}. {humanizeActionType(entry.action_type)}
                      </p>
                      <Badge variant="outline" className="shrink-0 gap-1 border-warning/60 text-xs">
                        <KeyRound className="h-3 w-3" /> elevated
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatOverrideAttribution(entry)}
                    </p>
                    {change && (
                      <p className="mt-1 break-words text-xs text-foreground/80">{change}</p>
                    )}
                    {entry.reason && (
                      <p className="mt-1 text-xs italic text-muted-foreground">"{entry.reason}"</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}

        {entries.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {entries.length} action{entries.length === 1 ? "" : "s"} · last one{" "}
            {formatCampShort(entries[entries.length - 1].created_at)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ElevationReceiptDialog;
