import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { consumeRecoveryPayload, recoveryRedirectTo } from "@/lib/recoveryLink";
import { Loader2 } from "lucide-react";

type Phase = "validating" | "ready" | "invalid";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("validating");
  const [problem, setProblem] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // If Supabase fires PASSWORD_RECOVERY on its own, accept it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) setPhase("ready");
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
          setPhase("ready");
          return;
        }

        if (payload?.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(payload.code);
          if (error) throw error;
          setPhase("ready");
          return;
        }

        if (payload?.token_hash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: payload.token_hash,
          });
          if (error) throw error;
          setPhase("ready");
          return;
        }

        // No token in the URL — only valid if a recovery session already exists.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setPhase("ready");
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
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      return;
    }
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
      <Card className="w-full max-w-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            {phase === "validating" && "Checking your reset link…"}
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
