import { useMemo, useState, useEffect } from "react";
import {
  Home,
  Building2,
  Images,
  CalendarDays,
  BookOpen,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Code2,
  Eye,
  Swords,
  ShieldAlert,
  ScanEye,
  Target,
  Download,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useRolePreview } from "@/hooks/useRolePreview";
import { canAccessRoute, permissions, type AppRole } from "@/lib/permissions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useOpenMaintenanceCount } from "@/hooks/useMaintenanceRequests";
import { usePendingHousekeepingCount } from "@/hooks/useHousekeepingTasks";

const navItems = [
  { titleKey: "nav.dashboard", url: "/dashboard", icon: Home },
  { titleKey: "nav.units", url: "/units", icon: Building2 },
  { titleKey: "nav.mediaLibrary", url: "/media-library", icon: Images },
  { titleKey: "nav.bookings", url: "/bookings", icon: BookOpen },
  { titleKey: "nav.calendar", url: "/calendar", icon: CalendarDays },
  { titleKey: "nav.pricing", url: "/pricing", icon: DollarSign },
  { titleKey: "nav.reports", url: "/reports", icon: BarChart3 },
  { titleKey: "nav.messages", url: "/messages", icon: MessageSquare },
  { titleKey: "nav.embeds", url: "/embeds", icon: Code2 },
  { titleKey: "nav.settings", url: "/settings", icon: Settings },
];

const PREVIEW_ROLES: AppRole[] = ["front_desk", "front_desk_supervisor", "manager", "maintenance", "viewer"];

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

function usePendingApprovalCount(canApprove: boolean) {
  return useQuery({
    queryKey: ["pending-approval-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("state", "pending_approval");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: canApprove,
    refetchInterval: 60_000,
  });
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { signOut, user, role, isAdmin } = useAuth();
  const { previewRole, setPreviewRole, effectiveRole, isPreviewMode } = useRolePreview();
  const canApprove = permissions.canApproveBooking(effectiveRole);
  const isMaintenance = effectiveRole === "maintenance";
  const isViewer = effectiveRole === "viewer";
  const { data: pendingCount } = usePendingUsersCount(isAdmin);
  const { data: approvalCount } = usePendingApprovalCount(canApprove);
  const { data: maintenanceCount } = useOpenMaintenanceCount();
  const { data: housekeepingCount } = usePendingHousekeepingCount();

  const visibleNavItems = navItems.filter((item) => canAccessRoute(effectiveRole, item.url));

  // Mobile install detection
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true);

  const isIOS =
    typeof navigator !== "undefined" &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  const isAndroid =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  const isMobileDevice = isIOS || isAndroid;
  const showInstall = isMobileDevice && !isStandalone;

  // Auto-popup on first login for mobile users
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (showInstall && user) {
      const key = `pwa-install-shown-${user.id}`;
      if (!localStorage.getItem(key)) {
        const timer = setTimeout(() => {
          setInstallDialogOpen(true);
          localStorage.setItem(key, "1");
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [showInstall, user]);

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setInstallDialogOpen(false);
    }
  };

  return (
    <>
    <Sidebar className="min-w-[22rem]">
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <Swords className="h-6 w-6 text-sidebar-primary shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-sidebar-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              {t("auth.groundStay")}
            </h2>
            <p className="text-sm text-sidebar-foreground/60 mt-0.5">{t("common.propertyManagement")}</p>
          </div>
        </div>
      </div>

      <SidebarContent className="py-3">
        <SidebarGroup className="px-4 py-2">
          <SidebarGroupLabel>{t("nav.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild className="h-11 px-4 text-[15px]">
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50 hover-slide-right"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary"
                    >
                      <item.icon className="mr-3 h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                      {item.url === "/settings" && !!pendingCount && pendingCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center animate-bounce-badge">
                          {pendingCount}
                        </Badge>
                      )}
                      {item.url === "/bookings" && !!approvalCount && approvalCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center animate-bounce-badge">
                          {approvalCount}
                        </Badge>
                      )}
                      {item.url === "/dashboard" && !isViewer && !!maintenanceCount && maintenanceCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center animate-bounce-badge">
                          {maintenanceCount + (housekeepingCount ?? 0)}
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
        <Link to="/simulation" className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
          <Target className="h-3.5 w-3.5" />
          {t("nav.warRoomSim", "War Room Sim")}
        </Link>
        {showInstall && (
          <button
            onClick={() => setInstallDialogOpen(true)}
            className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full text-left"
          >
            <Download className="h-3.5 w-3.5" />
            Install App
          </button>
        )}
        {isAdmin && (
          <>
            <Link to="/security-center" className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <ShieldAlert className="h-3.5 w-3.5" />
              Security Center
            </Link>
            <Link to="/disaster-recovery" className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <ShieldAlert className="h-3.5 w-3.5" />
              Disaster Recovery
            </Link>
            <Link to="/guest?preview=true" className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <Eye className="h-3.5 w-3.5" />
              {t("nav.previewGuestPortal")}
            </Link>
            <div className="flex items-center gap-2 px-2 py-1.5 mb-1 text-xs">
              <ScanEye className="h-3.5 w-3.5 text-sidebar-foreground/60 shrink-0" />
              <Select
                value={previewRole ?? "none"}
                onValueChange={(val) => setPreviewRole(val === "none" ? null : val as AppRole)}
              >
                <SelectTrigger className="h-7 text-xs border-sidebar-border">
                  <SelectValue placeholder={t("preview.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("preview.actualRole")}</SelectItem>
                  {PREVIEW_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
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
        <div className="text-[10px] text-sidebar-foreground/30 text-center mt-1">
          v{__APP_BUILD_DATE__}
        </div>
      </SidebarFooter>
    </Sidebar>

    {/* Install App Dialog — auto-opens on first mobile login */}
    <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-primary" />
            Get the App
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Install Ground Stay on your phone for faster access — it only takes a few seconds.
        </p>

        {isIOS ? (
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">1</div>
              <div>
                <p className="text-sm font-medium text-foreground">Tap Share</p>
                <p className="text-xs text-muted-foreground">The square icon with an arrow at the bottom of Safari</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">2</div>
              <div>
                <p className="text-sm font-medium text-foreground">Add to Home Screen</p>
                <p className="text-xs text-muted-foreground">Scroll down in the menu and tap it</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">3</div>
              <div>
                <p className="text-sm font-medium text-foreground">Tap Add</p>
                <p className="text-xs text-muted-foreground">That's it — the app will appear on your home screen</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
              ⚠️ Must use <span className="font-semibold text-foreground">Safari</span> — Chrome and other browsers on iPhone don't support this.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {deferredPrompt && (
              <Button onClick={handleNativeInstall} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Install App Now
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a
                href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/app-downloads/ground-stay.apk`}
                download
              >
                <Download className="h-4 w-4 mr-2" />
                Download Android App (.apk)
              </a>
            </Button>

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground font-medium mb-2">
                {deferredPrompt ? "Or install from browser:" : "Or install from browser:"}
              </p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                <li>Tap the <span className="font-semibold text-foreground">menu</span> (⋮) at the top right of Chrome</li>
                <li>Tap <span className="font-semibold text-foreground">Install app</span> or <span className="font-semibold text-foreground">Add to Home Screen</span></li>
              </ol>
            </div>
          </div>
        )}

        <Button onClick={() => setInstallDialogOpen(false)} className="w-full mt-2">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
    </>
  );
}
