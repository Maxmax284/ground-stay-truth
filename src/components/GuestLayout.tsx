import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Target, Download, Smartphone, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/LanguageToggle";
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
    <div className="guest-shell min-h-screen flex flex-col bg-background overflow-x-clip">
      <div className="thai-stripe" />
      <header className="h-14 flex items-center justify-between gap-2 border-b border-border px-3 sm:px-6 bg-card min-w-0">
        <h1
          className="text-base sm:text-lg font-bold text-foreground truncate min-w-0 leading-tight"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {t("auth.groundStay")}
        </h1>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
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
            className="hidden sm:inline-flex text-muted-foreground hover:text-foreground transition-colors"
            title={t("nav.platformGuide", "Platform Guide")}
          >
            <Target className="h-4 w-4" />
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          <NotificationBell />
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {user?.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground px-2 sm:px-3"
            aria-label={t("common.signOut")}
          >
            <LogOut className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t("common.signOut")}</span>
          </Button>
        </div>
      </header>
      <main className="flex-1 px-3 py-4 sm:p-6 pb-28 sm:pb-6 max-w-5xl mx-auto w-full min-w-0 overflow-x-clip">
        <div key={location.pathname} className="animate-page-entry min-w-0 max-w-full">
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
