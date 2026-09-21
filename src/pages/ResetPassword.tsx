import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { clearAllMfaTrust } from "@/lib/mfaTrust";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { consumeRecoveryPayload, recoveryRedirectTo } from "@/lib/recoveryLink";
import { KeyRound, LifeBuoy, Loader2, ShieldCheck } from "lucide-react";
import Seo from "@/components/Seo";


type Phase = "validating" | "mfa" | "ready" | "invalid";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("validating");
  const [problem, setProblem] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const ran = useRef(false);

  /**
   * Decides whether a second factor is still required before the password can
   * change. `force` is used after Auth itself answers `insufficient_aal`: in
   * that case MFA is required no matter what the local factor list says, so we
   * must land on the step-up screen instead of bouncing back to the password
   * form (which produced an unrecoverable loop).
   */
  const preparePasswordChange = async (force = false) => {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError && !force) throw assuranceError;

    const stepUpNeeded =
      force || (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2");

    if (stepUpNeeded) {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError && !force) throw factorsError;
      const verifiedFactor =
        factors?.totp?.find((factor) => factor.status === "verified") ?? factors?.totp?.[0] ?? null;

      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setUseRecoveryCode(false);
        setPhase("mfa");
        return;
      }

      if (force) {
        // Auth demands AAL2 but we cannot match a usable authenticator factor
        // (stale list, non-TOTP factor, fresh recovery session). Offer the
        // recovery-code path rather than a dead end.
        setFactorId(null);
        setUseRecoveryCode(true);
        setPhase("mfa");
        return;
      }
    }

    setPhase("ready");
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // A recovery link proves email ownership, but MFA-enabled accounts must
    // still reach AAL2 before Auth will permit a password change.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        void preparePasswordChange().catch(() => {
          setProblem("Could not check your two-factor security. Please request a new reset link.");
          setPhase("invalid");
        });
      }
    });

    (async () => {
      const payload = consumeRecoveryPayload();

      if (payload?.error) {
        setProblem(
          payload.error === "otp_expired" || /expired/i.test(payload.error_description ?? "")
            ? "That reset link has expired or was already used. Reset links are single-use and last one hour."
            : payload.error_description || "That reset link is not valid.",
        );
        setPhase("invalid");
        return;
      }

      try {
        if (payload?.access_token && payload?.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
          });
          if (error) throw error;
          await preparePasswordChange();
          return;
        }

        if (payload?.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(payload.code);
          if (error) throw error;
          await preparePasswordChange();
          return;
        }

        if (payload?.token_hash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: payload.token_hash,
          });
          if (error) throw error;
          await preparePasswordChange();
          return;
        }

        // No token in the URL — only valid if a recovery session already exists.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await preparePasswordChange();
        } else {
          setProblem("No reset link detected. Open the link from your email on this device, or request a new one below.");
          setPhase("invalid");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not validate the reset link.";
        setProblem(
          /expired|invalid/i.test(msg)
            ? "That reset link has expired or was already used. Request a new one below."
            : msg,
        );
        setPhase("invalid");
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const handleMfaVerify = async () => {
    if (!factorId || mfaCode.length !== 6) return;
    setVerifyingMfa(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: mfaCode.trim(),
    });
    setVerifyingMfa(false);
    if (error) {
      toast({ title: "Code didn't match", description: "Check your authenticator and try again.", variant: "destructive" });
      setMfaCode("");
      return;
    }
    setPhase("ready");
  };

  const handleRecoveryCode = async () => {
    if (recoveryCode.replace(/[^A-Z0-9]/gi, "").length < 8) return;
    setVerifyingMfa(true);
    const { data, error } = await supabase.functions.invoke("mfa-manage", {
      body: { action: "use_code", code: recoveryCode },
    });
    const message = (data as { error?: string } | null)?.error;
    if (error || message) {
      setVerifyingMfa(false);
      toast({
        title: "Recovery code not accepted",
        description: message ?? "That code is invalid or was already used.",
        variant: "destructive",
      });
      return;
    }

    // The recovery code removes the lost factor. Refresh so Auth immediately
    // evaluates the password update without the stale MFA enrollment claim.
    const { error: refreshError } = await supabase.auth.refreshSession();
    setVerifyingMfa(false);
    if (refreshError) {
      toast({ title: "Session refresh failed", description: "Request a new password reset link and try again.", variant: "destructive" });
      return;
    }
    setPhase("ready");
    toast({ title: "Recovery code accepted", description: "Set your new password, then reconnect your authenticator." });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      if (error.code === "insufficient_aal" || /AAL2/i.test(error.message)) {
        await preparePasswordChange(true).catch(() => {
          // Even the lookup failed — still show the step-up screen with the
          // recovery-code option so the user is never stuck on this form.
          setFactorId(null);
          setUseRecoveryCode(true);
          setPhase("mfa");
        });
        toast({
          title: "Two-factor verification required",
          description: "Confirm with your authenticator code, or use a recovery code if you lost it.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      return;
    }
    // A password change invalidates every trusted device: challenge again.
    clearAllMfaTrust();
    toast({ title: "Password updated", description: "Signing you in…" });
    setTimeout(() => navigate("/index", { replace: true }), 600);
  };

  const handleResend = async () => {
    if (!resendEmail.includes("@")) {
      toast({ title: "Enter your email address", variant: "destructive" });
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resendEmail.trim(), {
      redirectTo: recoveryRedirectTo(),
    });
    setResending(false);
    toast({
      title: error ? "Could not send reset email" : "Reset email sent",
      description: error ? error.message : "Open the link on this device. It expires in one hour.",
      variant: error ? "destructive" : "default",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center auth-hero-bg px-4">
      <Seo
        path="/reset-password"
        title="Reset Your Password — LMT CampStay"
        description="Set a new password for your LMT CampStay account."
        noindex
      />
      <Card className="w-full max-w-md border-border/50 shadow-2xl">

        <CardHeader>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Reset your password</h1>


          <CardDescription>
            {phase === "validating" && "Checking your reset link…"}
            {phase === "mfa" && "Your reset link is valid. Confirm your second factor to continue."}
            {phase === "ready" && "Enter a new password for your account."}
            {phase === "invalid" && problem}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {phase === "validating" && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> One moment…
            </div>
          )}

          {phase === "mfa" && (
            <div className="space-y-4">
              {useRecoveryCode ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="recovery-code">Recovery code</Label>
                    <Input
                      id="recovery-code"
                      value={recoveryCode}
                      autoFocus
                      autoComplete="one-time-code"
                      placeholder="ABCDE-FGHJK"
                      onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                    />
                    <p className="text-xs text-muted-foreground">
                      This removes the lost authenticator. You will reconnect it after signing in.
                    </p>
                  </div>
                  <Button className="w-full" disabled={verifyingMfa || recoveryCode.length < 8} onClick={handleRecoveryCode}>
                    {verifyingMfa ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Use recovery code
                  </Button>
                  <Button variant="ghost" className="w-full" disabled={verifyingMfa} onClick={() => setUseRecoveryCode(false)}>
                    Back to authenticator
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="mfa-code">6-digit authenticator code</Label>
                    <Input
                      id="mfa-code"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      autoComplete="one-time-code"
                      value={mfaCode}
                      placeholder="123456"
                      onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && mfaCode.length === 6) void handleMfaVerify();
                      }}
                    />
                  </div>
                  <Button className="w-full" disabled={verifyingMfa || mfaCode.length !== 6} onClick={handleMfaVerify}>
                    {verifyingMfa ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Verify and continue
                  </Button>
                  <Button variant="link" className="w-full" disabled={verifyingMfa} onClick={() => setUseRecoveryCode(true)}>
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    Lost your authenticator?
                  </Button>
                </>
              )}
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" minLength={8} autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" minLength={8} autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}

          {phase === "invalid" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resend">Email address</Label>
                <Input id="resend" type="email" autoComplete="email" value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <Button className="w-full" onClick={handleResend} disabled={resending}>
                {resending ? "Sending…" : "Send me a new reset link"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
                Back to sign in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
