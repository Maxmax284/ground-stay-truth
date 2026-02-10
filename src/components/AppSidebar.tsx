import {
  Home,
  Building2,
  CalendarDays,
  BookOpen,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Units", url: "/units", icon: Building2 },
  { title: "Bookings", url: "/bookings", icon: BookOpen },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Pricing", url: "/pricing", icon: DollarSign },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  front_desk_supervisor: "Supervisor",
  front_desk: "Front Desk",
  maintenance: "Maintenance",
  viewer: "Viewer",
  guest: "Guest",
};

function usePendingUsersCount(isAdmin: boolean) {
  return useQuery({
    queryKey: ["pending-users-count"],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id");
      if (pErr) throw pErr;

      // Get all assigned user_ids
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id");
      if (rErr) throw rErr;

      const assignedIds = new Set(roles.map((r) => r.user_id));
      return profiles.filter((p) => !assignedIds.has(p.user_id)).length;
    },
    enabled: isAdmin,
    refetchInterval: 60_000, // refresh every minute
  });
}

export function AppSidebar() {
  const { signOut, user, role, isAdmin } = useAuth();
  const { data: pendingCount } = usePendingUsersCount(isAdmin);

  const visibleNavItems = navItems.filter((item) => canAccessRoute(role, item.url));

  return (
    <Sidebar>
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="text-lg font-bold text-sidebar-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
          Ground Stay
        </h2>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">Property Management</p>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
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
              {ROLE_LABELS[role] ?? role}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
