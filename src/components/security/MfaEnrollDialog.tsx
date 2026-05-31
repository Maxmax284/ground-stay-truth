/**
 * MFA Enrollment Dialog (TOTP).
 * Three-step flow: enroll → display QR/secret → verify first code.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import { toast } from "sonner";

interface MfaEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: () => void;
}

export function MfaEnrollDialog({ open, onOpenChange, onEnrolled }: MfaEnrollDialogProps) {
  const logAudit = useLogStaffAudit();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"loading" | "scan" | "verify" | "done">("loading");

  useEffect(() => {
    if (!open) {
      setFactorId(null);
      setChallengeId(null);
      setQr(null);
      setSecret(null);
      setCode("");
      setStep("loading");
      return;
    }
    let cancelled = false;
    (async () => {
      const friendlyName = `Authenticator (${new Date().toLocaleDateString()})`;
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
      if (cancelled) return;
      if (error) {
        toast.error(`Could not start MFA enrollment: ${error.message}`);
        onOpenChange(false);
        return;
      }
      setFactorId(data.id);
      setQr((data as any).totp?.qr_code ?? null);
      setSecret((data as any).totp?.secret ?? null);
      const ch = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (cancelled) return;
      if (ch.error) {
        toast.error(`Could not start verification: ${ch.error.message}`);
        return;
      }
      setChallengeId(ch.data?.id ?? null);
      setStep("scan");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, onOpenChange]);

  const verify = async () => {
    if (!factorId || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      });
      if (error) {
        toast.error("Code didn't match. Try again.");
        setCode("");
        return;
      }
      logAudit.mutate({
        eventType: "mfa_setup_completed",
        severity: "info",
        reason: "TOTP factor enrolled",
      });
      logAudit.mutate({
        eventType: "mfa_enabled",
        severity: "info",
      });
      toast.success("Two-factor authentication enabled.");
      setStep("done");
      onEnrolled();
      setTimeout(() => onOpenChange(false), 800);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Enable two-factor authentication
          </DialogTitle>
          <DialogDescription>
            Scan the QR code with an authenticator app (1Password, Authy, Google Authenticator), then enter the 6-digit code it shows.
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "scan" && qr && (
          <div className="space-y-4">
            <div className="flex justify-center bg-white rounded-md p-4 border border-border">
              <img src={qr} alt="MFA QR code" className="h-44 w-44" />
            </div>
            {secret && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Or enter this key manually</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded break-all">{secret}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(secret);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Enter the 6-digit code</Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.length === 6) void verify();
                }}
              />
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 text-center space-y-2">
            <ShieldCheck className="h-10 w-10 text-primary mx-auto" />
            <p className="text-sm font-medium">MFA enabled.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {step === "done" ? "Close" : "Cancel"}
          </Button>
          {step === "scan" && (
            <Button onClick={verify} disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & enable"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
