/**
 * Tracks current route so the AI assistant can ground answers to the
 * page the user is on (Nav Assist / Feature Explainer). Ambient — never
 * overrides an explicit booking focus.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { setAIRouteFocus } from "@/lib/aiFocusStore";

const ROUTE_TO_PAGE_KEY: Record<string, string> = {
  "/dashboard": "dashboard",
  "/front-desk": "front_desk",
  "/bookings": "bookings",
  "/calendar": "calendar",
  "/units": "units",
  "/pricing": "pricing",
  "/reports": "reports",
  "/messages": "messages",
  "/settings": "settings",
  "/security-center": "security_center",
  "/monitoring": "monitoring",
  "/ops-control-tower": "ops_control_tower",
  "/admin/payment-report": "payments",
  "/media-library": "media_library",
  "/embeds": "embeds",
  "/simulation": "simulation",
  "/disaster-recovery": "disaster_recovery",
  "/guidance-lab": "guidance_lab",
  "/guest": "guest_portal",
};

export function AIRouteFocusTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    const pageKey = ROUTE_TO_PAGE_KEY[pathname] ?? null;
    setAIRouteFocus({ kind: "route", route: pathname, pageKey: pageKey ?? undefined });
  }, [pathname]);
  return null;
}
