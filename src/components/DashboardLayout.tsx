import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "@/components/NotificationBell";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Thai flag accent stripe */}
          <div className="thai-stripe" />
          <header className="h-14 flex items-center border-b border-border px-4 bg-card gap-3">
            <SidebarTrigger className="h-10 w-auto px-3 flex items-center gap-2 text-sm font-medium">
              <Menu className="h-5 w-5" />
              <span className="md:hidden">Menu</span>
            </SidebarTrigger>
            <span className="md:hidden text-sm font-semibold text-primary">Ground Stay</span>
            <span className="md:ml-0 text-sm font-medium text-muted-foreground">{t(titleKey)}</span>
            <div className="ml-auto">
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
    </SidebarProvider>
  );
};

export default DashboardLayout;
