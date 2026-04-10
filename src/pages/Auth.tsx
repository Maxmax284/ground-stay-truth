import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";

const Auth = () => {
  const { t } = useTranslation();
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-hero-bg">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user) return <Navigate to="/index" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center auth-hero-bg px-4 relative overflow-hidden corner-accent">
      <div className="absolute top-4 right-4 z-10">
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
                <Label htmlFor="password">{t("auth.password")}</Label>
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
