/**
 * OpsUnlockDialog — the security-code prompt.
 *
 * Shown whenever a staff member (admin included) tries to enter a gated ops
 * surface: Deep ops chat, AI draft approvals, break-glass elevation.
 *
 * The code is posted straight to the backend for verification — nothing is
 * compared here, and nothing is remembered beyond the tab-scoped token.
 */
import { useEffect, useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCountdown, useOpsUnlock } from "@/hooks/useOpsUnlock";

interface OpsUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the gate is open. */
  onUnlocked?: () => void;
  /** What the user was trying to reach, e.g. "Deep ops". */
  surface?: string;
}

export function OpsUnlockDialog({ open, onOpenChange, onUnlocked, surface }: OpsUnlockDialogProps) {
  const { unlock, unlocking, attemptError, clearAttemptError, lockedOut, lockoutMsLeft, configured } =
    useOpsUnlock();
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) {
      setCode("");
      clearAttemptError();
    }
    // clearAttemptError is stable enough for this reset; re-running on it would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Nothing configured yet — no reason to hold anyone up.
  useEffect(() => {
    if (open && !configured) {
      onOpenChange(false);
      onUnlocked?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, configured]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || lockedOut) return;
    const ok = await unlock(code.trim());
    if (ok) {
      setCode("");
      onOpenChange(false);
      onUnlocked?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Security code required
          </DialogTitle>
          <DialogDescription>
            {surface ? `${surface} is protected.` : "This area is protected."} Enter the ops security
            code. It stays unlocked for 15 minutes of activity and locks again when you close the tab.
          </DialogDescription>
        </DialogHeader>

        {lockedOut ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Too many wrong codes. Locked for {formatCountdown(lockoutMsLeft)}. An admin has been
              notified.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ops-code">Ops security code</Label>
              <Input
                id="ops-code"
                type="password"
                autoFocus
                autoComplete="off"
                inputMode="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="••••••"
              />
              {attemptError === "wrong_code" && (
                <p className="text-xs text-destructive">
                  That code is not right. Five wrong tries locks this account out for 15 minutes.
                </p>
              )}
              {attemptError === "locked_out" && (
                <p className="text-xs text-destructive">
                  Too many attempts — locked out for a few minutes.
                </p>
              )}
              {attemptError && !["wrong_code", "locked_out"].includes(attemptError) && (
                <p className="text-xs text-destructive">Could not check the code. Try again.</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={unlocking || !code.trim()}>
                {unlocking ? "Checking…" : "Unlock"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default OpsUnlockDialog;
