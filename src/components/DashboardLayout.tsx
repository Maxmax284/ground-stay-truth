import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "@/components/NotificationBell";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { ReinstallPrompt } from "@/components/ReinstallPrompt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { useRolePreview } from "@/hooks/useRolePreview";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SecurityFreezeBanner } from "@/components/SecurityFreezeBanner";
import { PropertyIndicator } from "@/components/PropertyIndicator";
import { useFenrirConfig } from "@/lib/fenrir";
import { SandboxModeBanner } from "@/components/SandboxModeBanner";
import { ElevationBanner } from "@/components/admin/ElevationBanner";


const routeTitleKeys: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/bookings": "nav.bookings",
  "/calendar": "nav.calendar",
  "/units": "nav.units",
  "/pricing": "nav.pricing",
  "/reports": "nav.reports",
  "/settings": "nav.settings",
  "/messages": "nav.messages",
  "/notifications": "nav.notifications",
  "/adjustments": "nav.adjustments",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const titleKey = routeTitleKeys[location.pathname] || "nav.dashboard";
  const { isPreviewMode, previewRole, setPreviewRole } = useRolePreview();
  const { signOut } = useAuth();
  
  // Initialize Fenrir Lock telemetry from policy_settings
  useFenrirConfig();

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "22rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
    >
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 w-full max-w-full">
          {/* Thai flag accent stripe */}
          <div className="thai-stripe" />
          {/* Security freeze banner */}
          <SecurityFreezeBanner />
          {/* Sandbox / practice camp banner */}
          <SandboxModeBanner />
          {/* Preview mode banner */}
          {isPreviewMode && (
            <div className="bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium">
              <span>
                {t("preview.banner", { role: t(`roles.${previewRole}`) })}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-amber-950 hover:text-amber-900 hover:bg-amber-400/50" onClick={() => setPreviewRole(null)}>
                <X className="h-4 w-4 mr-1" /> {t("preview.exit")}
              </Button>
            </div>
          )}
          <header className="h-14 flex items-center border-b border-border px-2 sm:px-4 bg-card gap-1 sm:gap-3 overflow-hidden">
            <SidebarTrigger className="h-10 w-auto px-2 sm:px-3 flex items-center gap-1 sm:gap-2 text-sm font-medium shrink-0">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <div className="hidden sm:block shrink-0">
              <PropertyIndicator />
            </div>
            <span className="text-sm font-medium text-muted-foreground truncate min-w-0">{t(titleKey)}</span>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <LanguageToggle />
              <ThemeToggle />
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                title={t("common.signOut")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <ElevationBanner />
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden ring-rope-pattern min-w-0">

            <div key={location.pathname} className="animate-page-entry min-w-0 max-w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
      <AIAssistantPanel />
      <TutorialOverlay variant="staff" />
      <PWAInstallBanner variant="admin" />
      <ReinstallPrompt />
    </SidebarProvider>
  );
};

export default DashboardLayout;
