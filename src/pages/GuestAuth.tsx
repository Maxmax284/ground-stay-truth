import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { supabase } from "@/integrations/supabase/client";

const GuestAuth = () => {
  const { t } = useTranslation();
  const { user, role, loading, roleResolved, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const unitParam = searchParams.get("unit");
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-hero-bg-guest">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user && !roleResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-hero-bg-guest">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user) {
    if (role === "guest") return <Navigate to={unitParam ? `/guest?unit=${unitParam}` : "/guest"} replace />;
    // Role resolved but not a guest (staff, or no role row yet) — hand off to the
    // role router instead of hard-forcing /dashboard, which dead-ends for
    // accounts whose role hasn't been assigned.
    return <Navigate to="/index" replace />;
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = isLogin
      ? await signIn(email, password)
      : await signUp(email, password, fullName);

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else if (!isLogin) {
      toast({
        title: t("auth.checkEmail"),
        description: t("auth.checkEmailDesc"),
      });
    }
    setSubmitting(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: t("common.error"), description: "Enter your email first", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent you a password reset link." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center auth-hero-bg-guest px-4 relative overflow-hidden corner-accent">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <a href="/auth" className="inline-flex items-center gap-1 text-xs font-medium text-primary-foreground/70 hover:text-primary-foreground transition-colors">
          Staff Login
        </a>
        <LanguageSelector />
      </div>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center">
          <h1
            className="font-serif text-3xl font-bold text-primary-foreground animate-title-in"
          >
            {t("auth.groundStay")}
          </h1>
          <p className="mt-1 text-sm text-primary-foreground/60 font-stat tracking-wider uppercase animate-fade-up animate-stagger-2">
            Fighter's Quarters
          </p>
          <p className="mt-3 text-primary-foreground/70 animate-fade-up animate-stagger-3">
            {isLogin ? t("auth.welcomeBack") : t("guestAuth.createAccount")}
          </p>
        </div>

        <Card className="animate-slide-up animate-stagger-3 border-border/50 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl">
              {isLogin ? t("auth.signIn") : t("auth.signUp")}
            </CardTitle>
            <CardDescription>
              {isLogin ? t("guestAuth.signInDesc") : t("guestAuth.signUpDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("auth.yourName")}
                    required={!isLogin}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                  minLength={6}
                />
              </div>
              {!isLogin && (
                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-input accent-primary"
                    required
                  />
                  <label htmlFor="consent" className="text-xs text-muted-foreground leading-tight">
                    {t("legal.consentCheckbox", "I agree to the")}{" "}
                    <a href="/legal#terms" target="_blank" className="font-medium text-primary hover:underline">{t("legal.termsOfService")}</a>
                    {" "}{t("legal.and")}{" "}
                    <a href="/legal#privacy" target="_blank" className="font-medium text-primary hover:underline">{t("legal.privacyPolicy")}</a>
                    {". "}{t("legal.consentDataProcessing", "I consent to the processing of my personal data as described in the Privacy Policy.")}
                  </label>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting || (!isLogin && !consentChecked)}>
                {submitting ? t("common.pleaseWait") : isLogin ? t("auth.signIn") : t("guestAuth.createAccount")}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-primary hover:underline"
              >
                {isLogin ? t("auth.signUp") : t("auth.signIn")}
              </button>
            </div>
            <div className="mt-3 text-center text-xs text-muted-foreground">
              {t("guestAuth.staffLink")}{" "}
              <a href="/auth" className="font-medium text-primary hover:underline">
                {t("guestAuth.staffSignIn")}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestAuth;
