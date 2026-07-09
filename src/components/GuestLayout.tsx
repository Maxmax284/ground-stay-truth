import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Target, Download, Smartphone, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { FrontDeskFAB } from "@/components/FrontDeskFAB";
import lamaiLogo from "@/assets/lamai-logo.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface GuestLayoutProps {
  children: React.ReactNode;
}

const GuestLayout = ({ children }: GuestLayoutProps) => {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const location = useLocation();

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isAndroid = /android/i.test(navigator.userAgent);

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
          {!isStandalone && (isIOS || isAndroid) && (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Install App"
                >
                  <Download className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-primary" />
                    Install <span className="font-stat uppercase tracking-tight">LMT CampStay</span>
                  </DialogTitle>

                </DialogHeader>
                <div className="space-y-3 text-sm text-muted-foreground">
                  {isIOS ? (
                    <>
                      <p>To install this app on your iPhone or iPad:</p>
                      <ol className="list-decimal pl-5 space-y-2">
                        <li>Tap the <span className="font-semibold text-foreground">Share</span> button <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-xs">⬆</span> at the bottom of Safari</li>
                        <li>Scroll down and tap <span className="font-semibold text-foreground">Add to Home Screen</span></li>
                        <li>Tap <span className="font-semibold text-foreground">Add</span> in the top right</li>
                      </ol>
                      <p className="text-xs">Note: This must be done in Safari. Other browsers on iOS don't support app installation.</p>
                    </>
                  ) : (
                    <>
                      <p>To install this app on your Android device:</p>
                      <ol className="list-decimal pl-5 space-y-2">
                        <li>Tap the <span className="font-semibold text-foreground">menu</span> (⋮) in your browser</li>
                        <li>Tap <span className="font-semibold text-foreground">Install app</span> or <span className="font-semibold text-foreground">Add to Home Screen</span></li>
                      </ol>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Link
            to="/simulation"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={t("nav.platformGuide", "Platform Guide")}
          >
            <Target className="h-4 w-4" />
          </Link>
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
      <footer className="border-t border-border bg-card px-6 py-3 text-center text-xs text-muted-foreground space-y-1">
        <div>
          <a href="/legal#privacy" className="hover:text-foreground hover:underline">{t("legal.privacyPolicy")}</a>
          <span className="mx-2">·</span>
          <a href="/legal#terms" className="hover:text-foreground hover:underline">{t("legal.termsOfService")}</a>
        </div>
        <div className="text-muted-foreground/60 flex items-center justify-center gap-1.5">
          <img src={lamaiLogo} alt="Lamai Muay Thai" className="h-4 w-4 opacity-50" loading="lazy" width={512} height={512} />
          Powered by{" "}
          <a href="https://lamaimuaythai.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline transition-colors">
            Lamai Muay Thai
          </a>
        </div>
        <div className="text-muted-foreground/40 text-[10px]">
          v{__APP_BUILD_DATE__}
        </div>
      </footer>
      <AIAssistantPanel />
      <FrontDeskFAB />
      <TutorialOverlay variant="guest" />
    </div>
  );
};

export default GuestLayout;
