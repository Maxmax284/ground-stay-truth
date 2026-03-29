import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "@/components/NotificationBell";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { useRolePreview } from "@/hooks/useRolePreview";
import { Button } from "@/components/ui/button";
import { SecurityFreezeBanner } from "@/components/SecurityFreezeBanner";
import { useFenrirConfig } from "@/lib/fenrir";

const routeTitleKeys: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/bookings": "nav.bookings",
  "/calendar": "nav.calendar",
  "/units": "nav.units",
  "/pricing": "nav.pricing",
  "/reports": "nav.reports",
  "/settings": "nav.settings",
  "/messages": "nav.messages",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const titleKey = routeTitleKeys[location.pathname] || "nav.dashboard";
  const { isPreviewMode, previewRole, setPreviewRole } = useRolePreview();
  
  // Initialize Fenrir Lock telemetry from policy_settings
  useFenrirConfig();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Thai flag accent stripe */}
          <div className="thai-stripe" />
          {/* Security freeze banner */}
          <SecurityFreezeBanner />
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
          <header className="h-14 flex items-center border-b border-border px-4 bg-card gap-3">
            <SidebarTrigger className="h-10 w-auto px-3 flex items-center gap-2 text-sm font-medium">
              <Menu className="h-5 w-5" />
              <span className="md:hidden">{t("common.menu")}</span>
            </SidebarTrigger>
            <span className="md:hidden text-sm font-semibold text-primary">{t("auth.groundStay")}</span>
            <span className="md:ml-0 text-sm font-medium text-muted-foreground">{t(titleKey)}</span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto ring-rope-pattern">
            <div key={location.pathname} className="animate-page-entry">
              {children}
            </div>
          </main>
        </div>
      </div>
      <AIAssistantPanel />
      <TutorialOverlay variant="staff" />
      <PWAInstallBanner />
    </SidebarProvider>
  );
};

export default DashboardLayout;
