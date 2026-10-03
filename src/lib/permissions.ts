/**
 * Role hierarchy + capability matrix.
 *
 * SECURITY-CRITICAL. This is the client-side mirror of what the DB enforces
 * via `has_role()` and RLS. The DB is always the real authority — this file
 * exists so the UI can hide buttons the user can't push anyway. Never rely
 * on it for actual access control.
 *
 * Hierarchy (ascending authority):
 *   guest → viewer → maintenance → front_desk → front_desk_supervisor
 *         → manager → admin
 *
 * Admin is the only role allowed to do irreversible stuff (deletes, refunds
 * without cap, role assignments, secret management). Managers can
 * "recommend" — admins approve.
 */
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Role hierarchy — higher index = more authority.
 * Used for comparisons like "can this role do X?"
 */
const ROLE_HIERARCHY: Record<AppRole, number> = {
  guest: 0,
  viewer: 1,
  maintenance: 2,
  front_desk: 3,
  front_desk_supervisor: 4,
  manager: 5,
  admin: 6,
};

/** Navigation items visible per role */
const NAV_ACCESS: Record<string, AppRole[]> = {
  "/dashboard": ["front_desk", "front_desk_supervisor", "manager", "admin", "viewer", "maintenance"],
  "/units":     ["manager", "admin"],
  "/media-library": ["manager", "admin"],
  "/bookings":  ["front_desk", "front_desk_supervisor", "manager", "admin", "viewer"],
  "/front-desk": ["front_desk", "front_desk_supervisor", "manager", "admin"],
  "/check-in-desk": ["front_desk", "front_desk_supervisor", "manager", "admin"],
  "/arrivals-board": ["front_desk", "front_desk_supervisor", "manager", "admin"],
  "/arrival-intelligence": ["front_desk_supervisor", "manager", "admin"],
  "/admin-booking": ["admin"],
  "/guest-preview": ["admin"],
  "/guest?preview=true": ["admin"],
  "/calendar":  ["front_desk", "front_desk_supervisor", "manager", "admin", "viewer", "maintenance"],
  "/pricing":   ["manager", "admin"],
  "/reports":   ["manager", "admin", "viewer"],
  "/settings":  ["front_desk", "front_desk_supervisor", "manager", "admin"],
  "/messages":  ["front_desk", "front_desk_supervisor", "manager", "admin"],
  "/notifications": ["front_desk", "front_desk_supervisor", "manager", "admin", "viewer", "maintenance"],
  "/adjustments": ["manager", "admin"],
  "/embeds":    ["manager", "admin"],
  "/simulation": ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer", "guest"],
  "/disaster-recovery": ["admin"],
  "/security-center": ["admin"],
  "/monitoring": ["manager", "admin"],
  "/ops-control-tower": ["admin"],
  // Ops Console: staff can read and ask; the code gate and RLS decide what they may act on.
  "/ops-console": ["front_desk", "front_desk_supervisor", "manager", "admin"],
};

export function canAccessRoute(role: AppRole | null, path: string): boolean {
  if (!role) return false;
  const allowed = NAV_ACCESS[path];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Permission checks based on constitutional role definitions */
export const permissions = {
  /** Can create bookings */
  canCreateBooking: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk,

  /** Can transition booking states (standard flow) */
  canTransitionState: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk,

  /** Can complete check-in (Confirmed → Checked-In) — Supervisor+ */
  canCompleteCheckIn: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk_supervisor,

  /** Can complete check-out (Checked-In → Completed) — Supervisor+ */
  canCompleteCheckOut: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk_supervisor,

  /** Can use admin override on state machine — Admin only */
  canAdminOverride: (role: AppRole | null) =>
    role === "admin",

  /** Can view payment amounts (Front Desk sees Paid/Unpaid only) */
  canViewPaymentAmounts: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can record payments */
  canRecordPayment: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk_supervisor,

  /** Can manage units (CRUD) */
  canManageUnits: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can manage pricing rules */
  canManagePricing: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can manage user roles */
  canManageRoles: (role: AppRole | null) =>
    role === "admin",

  /** Can manage policy settings */
  canManagePolicies: (role: AppRole | null) =>
    role === "admin",

  /** Can approve early check-in overrides — Manager+ */
  canApproveOverride: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can view reports */
  canViewReports: (role: AppRole | null) =>
    !!role && ["manager", "admin", "viewer"].includes(role),

  /** Can send messages */
  canSendMessages: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk,

  /** Can manage maintenance blocks — Manager+ */
  canManageMaintenanceBlocks: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can approve/reject bookings — Admin only */
  canApproveBooking: (role: AppRole | null) =>
    role === "admin",

  /** Can recommend approve/reject bookings — Manager+ */
  canRecommendBooking: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can dismiss (cancel) inquiries — Admin only */
  canDismissInquiry: (role: AppRole | null) =>
    role === "admin",

  /** Can hold inquiries — Manager+ */
  canHoldInquiry: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can execute critical state transitions (approval/deposit/confirm) — Admin only */
  canApproveStateTransition: (role: AppRole | null) =>
    role === "admin",

  /** Can upload ID documents — Front Desk+ or Guest (own docs) */
  canUploadDocuments: (role: AppRole | null) =>
    !!role && (role === "guest" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk),

  /** Is a staff member (not guest) */
  isStaff: (role: AppRole | null) =>
    !!role && role !== "guest",

  // ── Stay Support permissions ──

  /** Can create maintenance requests — Guest (own booking) or Front Desk+ */
  canCreateMaintenanceRequest: (role: AppRole | null) =>
    !!role && (role === "guest" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk),

  /** Can resolve maintenance requests — Maintenance role or Manager+ */
  canResolveMaintenanceRequest: (role: AppRole | null) =>
    !!role && (role === "maintenance" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager),

  /** Can update maintenance status (start) — Maintenance role or Manager+ */
  canUpdateMaintenanceStatus: (role: AppRole | null) =>
    !!role && (role === "maintenance" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager),

  /** Can view maintenance requests — Front Desk+ (all) or Guest (own) */
  canViewMaintenanceRequests: (role: AppRole | null) =>
    !!role && (role === "guest" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk),

  /** Can create laundry requests — Guest (own booking) or Front Desk+ */
  canCreateLaundryRequest: (role: AppRole | null) =>
    !!role && (role === "guest" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk),

  /** Can override deposit requirement (manual when online required) — Manager+ */
  canOverrideDeposit: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can update laundry status — Front Desk+ (all staff) */
  canUpdateLaundryStatus: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk,

  /** Can view laundry requests — Front Desk+ (all) or Guest (own) */
  canViewLaundryRequests: (role: AppRole | null) =>
    !!role && (role === "guest" || ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk),

  /** Can override stay support status (laundry/maintenance) — Manager+ */
  canOverrideStaySupport: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager,

  /** Can manage reviews (approve/reject/delete) — Admin only */
  canManageReviews: (role: AppRole | null) =>
    role === "admin",
} as const;
