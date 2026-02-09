import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/bookings": "Bookings",
  "/calendar": "Calendar",
  "/units": "Units",
  "/pricing": "Pricing",
  "/reports": "Reports",
  "/settings": "Settings",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const pageTitle = routeTitles[location.pathname] || "Dashboard";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card gap-3">
            <SidebarTrigger className="h-10 w-auto px-3 flex items-center gap-2 text-sm font-medium">
              <Menu className="h-5 w-5" />
              <span className="md:hidden">Menu</span>
            </SidebarTrigger>
            <span className="md:hidden text-sm font-semibold text-primary">Ground Stay</span>
            <span className="ml-auto md:ml-0 text-sm font-medium text-muted-foreground">{pageTitle}</span>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
