/**
 * Step-Up Verification Dialog.
 * Re-challenges the user's enrolled TOTP factor before a sensitive action.
 * Falls back to a clear "MFA required" prompt if the user is not enrolled
 * but policy demands step-up.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMfaStatus, markStepUpVerified } from "@/hooks/useMfa";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import { toast } from "sonner";

interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short description of the action that triggered step-up */
  action: string;
  /** Called after successful TOTP verification */
  onVerified: () => void;
}

export function StepUpDialog({ open, onOpenChange, action, onVerified }: StepUpDialogProps) {
  const status = useMfaStatus();
  const logAudit = useLogStaffAudit();
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset state on open/close and create a fresh challenge
  useEffect(() => {
    if (!open) {
      setCode("");
      setChallengeId(null);
      return;
    }
    if (!status.factorId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId: status.factorId! });
      if (cancelled) return;
      if (error) {
        toast.error(`Could not start verification: ${error.message}`);
        return;
      }
      setChallengeId(data?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, status.factorId]);

  const verify = async () => {
    if (!status.factorId || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: status.factorId,
        challengeId,
        code: code.trim(),
      });
      if (error) {
        logAudit.mutate({
          eventType: "step_up_challenge_failed",
          severity: "medium",
          reason: action,
          metadata: { error_code: error.code ?? null },
        });
        toast.error("Code didn't match. Try again.");
        setCode("");
        return;
      }
      markStepUpVerified();
      logAudit.mutate({
        eventType: "step_up_challenge_passed",
        severity: "info",
        reason: action,
      });
      onOpenChange(false);
      onVerified();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verify it's you
          </DialogTitle>
          <DialogDescription>
            Confirm with your authenticator before {action}.
          </DialogDescription>
        </DialogHeader>

        {!status.loading && !status.verified ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">MFA not enrolled</p>
              <p className="text-muted-foreground mt-1">
                Enable two-factor authentication in your account settings before performing this action.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">6-digit code</Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.length === 6) void verify();
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This verification stays active for 5 minutes.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={verify}
            disabled={busy || code.length !== 6 || !status.verified || !challengeId}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
