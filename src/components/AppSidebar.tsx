import {
  Home,
  Building2,
  CalendarDays,
  BookOpen,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Eye,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";

const navItems = [
  { titleKey: "nav.dashboard", url: "/dashboard", icon: Home },
  { titleKey: "nav.units", url: "/units", icon: Building2 },
  { titleKey: "nav.bookings", url: "/bookings", icon: BookOpen },
  { titleKey: "nav.calendar", url: "/calendar", icon: CalendarDays },
  { titleKey: "nav.pricing", url: "/pricing", icon: DollarSign },
  { titleKey: "nav.reports", url: "/reports", icon: BarChart3 },
  { titleKey: "nav.messages", url: "/messages", icon: MessageSquare },
  { titleKey: "nav.settings", url: "/settings", icon: Settings },
];

function usePendingUsersCount(isAdmin: boolean) {
  return useQuery({
    queryKey: ["pending-users-count"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id");
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id");
      if (rErr) throw rErr;

      const assignedIds = new Set(roles.map((r) => r.user_id));
      return profiles.filter((p) => !assignedIds.has(p.user_id)).length;
    },
    enabled: isAdmin,
    refetchInterval: 60_000,
  });
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { signOut, user, role, isAdmin } = useAuth();
  const { data: pendingCount } = usePendingUsersCount(isAdmin);

  const visibleNavItems = navItems.filter((item) => canAccessRoute(role, item.url));

  return (
    <Sidebar>
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="text-lg font-bold text-sidebar-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
          Ground Stay
        </h2>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">{t("common.propertyManagement")}</p>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                      {item.url === "/settings" && !!pendingCount && pendingCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">
                          {pendingCount}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="text-xs text-sidebar-foreground/60 truncate flex-1">
            {user?.email}
          </div>
          {role && (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {t(`roles.${role}`)}
            </Badge>
          )}
        </div>
        {isAdmin && (
          <Link to="/guest?preview=true" className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <Eye className="h-3.5 w-3.5" />
            {t("nav.previewGuestPortal")}
          </Link>
        )}
        <div className="px-1 mb-2">
          <LanguageSelector compact />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("common.signOut")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
