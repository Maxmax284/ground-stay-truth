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

const GuestAuth = () => {
  const { t } = useTranslation();
  const { user, role, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center auth-hero-bg-guest">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (user) {
    if (role === "guest") return <Navigate to="/guest" replace />;
    return <Navigate to="/dashboard" replace />;
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

  return (
    <div className="flex min-h-screen items-center justify-center auth-hero-bg-guest px-4 relative overflow-hidden corner-accent">
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
                {submitting ? t("common.pleaseWait") : isLogin ? t("auth.signIn") : t("guestAuth.createAccount")}
              </Button>
            </form>
            {!isLogin && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t("legal.bySigningUp")}{" "}
                <a href="/legal#terms" className="font-medium text-primary hover:underline">{t("legal.termsOfService")}</a>
                {" "}{t("legal.and")}{" "}
                <a href="/legal#privacy" className="font-medium text-primary hover:underline">{t("legal.privacyPolicy")}</a>.
              </p>
            )}
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
