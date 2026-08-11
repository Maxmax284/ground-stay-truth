/**
 * MfaGate — blocks admin surfaces until the MFA requirement is satisfied.
 *
 * Two states are interactive:
 *   enroll_required     → the account must set up an authenticator app
 *   challenge_required  → enrolled, but this session/device needs a code
 *
 * The gate renders INSTEAD of its children, so no admin page, query or data
 * fetch behind it ever mounts. Direct URL navigation hits the same gate.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldAlert, ShieldCheck, LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMfaGate, useMfaStatus } from "@/hooks/useMfa";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import { MfaEnrollDialog } from "./MfaEnrollDialog";
import { toast } from "sonner";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

function EnrollScreen({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Admin accounts require MFA
        </CardTitle>
        <CardDescription>
          Please set up an authenticator app to continue. It protects bookings, payments, guest
          documents, and admin settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden, Apple
          Passwords — any standard authenticator app.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => setOpen(true)}>
            Set up now
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </CardContent>
      <MfaEnrollDialog open={open} onOpenChange={setOpen} onEnrolled={onDone} />
    </>
  );
}

function ChallengeScreen({
  onVerified,
  trustWindowHours,
}: {
  onVerified: () => void;
  trustWindowHours: number;
}) {
  const status = useMfaStatus();
  const { signOut } = useAuth();
  const logAudit = useLogStaffAudit();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const verify = async () => {
    if (!status.factorId || code.length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: status.factorId,
        code: code.trim(),
      });
      if (error) {
        logAudit.mutate({
          eventType: "mfa_challenge_failed",
          severity: "medium",
          reason: "Admin session challenge",
        });
        toast.error("Code didn't match. Try again.");
        setCode("");
        return;
      }
      logAudit.mutate({
        eventType: "mfa_challenge_passed",
        severity: "info",
        reason: "Admin session challenge",
        metadata: { trust_window_hours: trustWindowHours },
      });
      onVerified();
    } finally {
      setBusy(false);
    }
  };

  const useRecoveryCode = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-manage", {
        body: { action: "use_code", code: recoveryCode },
      });
      const message = (data as { error?: string } | null)?.error;
      if (error || message) {
        toast.error(message ?? "That code isn't valid or was already used.");
        return;
      }
      toast.success("Recovery code accepted. Set up your authenticator app again.");
      await status.refresh();
      onVerified();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Enter your 6-digit code
        </CardTitle>
        <CardDescription>
          Open your authenticator app and enter the code it shows. This device will stay trusted for{" "}
          {trustWindowHours} hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recovery ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-sm">Recovery code</Label>
              <Input
                value={recoveryCode}
                autoFocus
                placeholder="ABCDE-FGHJK"
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-muted-foreground">
                Using a recovery code removes your current authenticator. You'll set up a new one right
                after.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={busy || recoveryCode.length < 8} onClick={useRecoveryCode}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Use recovery code
              </Button>
              <Button variant="ghost" onClick={() => setRecovery(false)} disabled={busy}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-sm">6-digit code</Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                placeholder="123456"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.length === 6) void verify();
                }}
              />
            </div>
            <Button className="w-full" disabled={busy || code.length !== 6} onClick={verify}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify
            </Button>
            <div className="flex items-center justify-between">
              <Button variant="link" size="sm" className="px-0" onClick={() => setRecovery(true)}>
                <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
                Lost your phone?
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </>
  );
}

export function MfaGate({ children }: { children: React.ReactNode }) {
  const gate = useMfaGate();

  // Re-check after enrollment / verification.
  useEffect(() => {
    if (gate.state === "loading") return;
  }, [gate.state]);

  if (gate.state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (gate.state === "enroll_required") {
    return (
      <Shell>
        <EnrollScreen
          onDone={() => {
            gate.confirmVerified();
            void gate.refresh();
          }}
        />
      </Shell>
    );
  }

  if (gate.state === "challenge_required") {
    return (
      <Shell>
        <ChallengeScreen
          trustWindowHours={gate.trustWindowHours}
          onVerified={() => {
            gate.confirmVerified();
            void gate.refresh();
          }}
        />
      </Shell>
    );
  }

  return <>{children}</>;
}

export default MfaGate;
