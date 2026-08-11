/**
 * ElevationBanner — loud, persistent indicator that the current session is
 * running with temporary (borrowed) admin authority.
 *
 * What it shows:
 *  - who opened the window (self-issued vs lent by another admin) and why
 *  - a live countdown, going urgent in the last minute
 *  - a receipt of everything done so far in the window
 *  - one tap to hand the authority back early
 *
 * When the window ends the receipt is offered automatically, so borrowed power
 * always closes out with a readable summary.
 */
import { useEffect, useRef, useState } from "react";
import { KeyRound, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyElevation } from "@/hooks/useAdminElevation";
import { ElevationReceiptDialog } from "@/components/admin/ElevationReceiptDialog";

export function ElevationBanner() {
  const { isActive, elevation, countdown, secondsLeft, revoke, isRevoking } = useMyElevation();

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [closedOut, setClosedOut] = useState(false);
  // Remember the window we were in so the receipt survives the grant vanishing.
  const lastGrant = useRef<{ id: string; reason: string } | null>(null);
  const wasActive = useRef(false);

  useEffect(() => {
    if (isActive && elevation) {
      lastGrant.current = { id: elevation.id, reason: elevation.reason };
      wasActive.current = true;
      return;
    }
    // The window just lapsed or was handed back — offer the close-out receipt.
    if (wasActive.current && !isActive) {
      wasActive.current = false;
      setClosedOut(true);
      setReceiptOpen(true);
    }
  }, [isActive, elevation]);

  const openReceipt = () => {
    setClosedOut(false);
    setReceiptOpen(true);
  };

  return (
    <>
      {isActive && elevation && (
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs sm:text-sm ${
            secondsLeft <= 60
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-warning bg-warning text-warning-foreground"
          }`}
        >
          <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold uppercase tracking-wide">
            Borrowed admin authority
          </span>
          <span className="font-mono tabular-nums">{countdown} left</span>
          <span className="opacity-80">
            {elevation.self_issued ? "self-issued" : "lent by an admin"}
          </span>
          <span className="min-w-0 flex-1 truncate opacity-80">— {elevation.reason}</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 px-2"
            onClick={openReceipt}
          >
            <FileText className="mr-1 h-3 w-3" aria-hidden="true" />
            Receipt
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 px-2"
            disabled={isRevoking}
            onClick={() => revoke()}
          >
            <X className="mr-1 h-3 w-3" aria-hidden="true" />
            Hand it back
          </Button>
        </div>
      )}

      <ElevationReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        grantId={lastGrant.current?.id ?? null}
        reason={lastGrant.current?.reason ?? null}
        closed={closedOut}
      />
    </>
  );
}
