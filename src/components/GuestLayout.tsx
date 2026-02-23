import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { TutorialOverlay } from "@/components/TutorialOverlay";

interface GuestLayoutProps {
  children: React.ReactNode;
}

const GuestLayout = ({ children }: GuestLayoutProps) => {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="thai-stripe" />
      <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-card">
        <h1
          className="text-lg font-bold text-foreground"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {t("auth.groundStay")}
        </h1>
        <div className="flex items-center gap-3">
          <LanguageSelector compact />
          <ThemeToggle />
          <NotificationBell />
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {user?.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4 mr-1" />
            {t("common.signOut")}
          </Button>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div key={location.pathname} className="animate-page-entry">
          {children}
        </div>
      </main>
      <footer className="border-t border-border bg-card px-6 py-3 text-center text-xs text-muted-foreground">
        <a href="/legal#privacy" className="hover:text-foreground hover:underline">{t("legal.privacyPolicy")}</a>
        <span className="mx-2">·</span>
        <a href="/legal#terms" className="hover:text-foreground hover:underline">{t("legal.termsOfService")}</a>
      </footer>
      <AIAssistantPanel />
      <TutorialOverlay variant="guest" />
    </div>
  );
};

export default GuestLayout;
