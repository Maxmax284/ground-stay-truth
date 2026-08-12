import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { supabase } from "@/integrations/supabase/client";
import { recoveryRedirectTo } from "@/lib/recoveryLink";
import Seo from "@/components/Seo";


const Auth = () => {
  const { t } = useTranslation();
  const { user, loading, signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-hero-bg">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user) return <Navigate to={nextPath ?? "/index"} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleForgotPassword = async () => {
    if (!email || !email.includes("@")) {
      toast({ title: "Enter your email above first", variant: "destructive" });
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectTo(),
    });
    setSendingReset(false);
    if (error) {
      toast({ title: "Could not send reset email", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Reset email sent", description: "Check your inbox for the reset link." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center auth-hero-bg px-4 relative overflow-hidden corner-accent">
      <Seo
        path="/auth"
        title="Staff Login — LMT CampStay Operations"
        description="Sign in to the LMT CampStay staff console to manage bookings, arrivals, payments and daily camp operations."
        noindex
      />
      <div className="absolute top-4 right-4 z-10">

        <LanguageSelector />
      </div>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center">
          <h1
            className="font-stat text-4xl sm:text-5xl font-bold uppercase tracking-tight text-primary-foreground animate-title-in"
          >
            {t("auth.groundStay")}
            <span className="sr-only"> — staff login for camp stay operations</span>
          </h1>


          <p className="mt-1 text-sm text-primary-foreground/60 font-stat tracking-wider uppercase animate-fade-up animate-stagger-2">
            Train. Stay. Compete.
          </p>
          <p className="mt-3 text-primary-foreground/70 animate-fade-up animate-stagger-3">{t("staffAuth.welcomeBack")}</p>
        </div>

        <Card className="animate-slide-up animate-stagger-3 border-border/50 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl">{t("auth.signIn")}</CardTitle>
            <CardDescription>{t("staffAuth.enterCredentials")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={sendingReset}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {sendingReset ? "Sending…" : "Forgot password?"}
                  </button>
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("common.pleaseWait") : t("auth.signIn")}
              </Button>
            </form>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("legal.bySigningUp")}{" "}
              <a href="/legal#terms" className="font-medium text-primary hover:underline">{t("legal.termsOfService")}</a>
              {" "}{t("legal.and")}{" "}
              <a href="/legal#privacy" className="font-medium text-primary hover:underline">{t("legal.privacyPolicy")}</a>.
            </p>
            <div className="mt-4 text-center text-xs text-muted-foreground">
              {t("staffAuth.guestLink")}{" "}
              <a href="/auth/guest" className="font-medium text-primary hover:underline">
                {t("staffAuth.guestSignIn")}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
