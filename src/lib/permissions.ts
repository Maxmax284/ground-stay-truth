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
  "/bookings":  ["front_desk", "front_desk_supervisor", "manager", "admin", "viewer"],
  "/calendar":  ["front_desk", "front_desk_supervisor", "manager", "admin", "viewer", "maintenance"],
  "/pricing":   ["manager", "admin"],
  "/reports":   ["manager", "admin", "viewer"],
  "/settings":  ["front_desk", "front_desk_supervisor", "manager", "admin"],
  "/messages":  ["front_desk", "front_desk_supervisor", "manager", "admin"],
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
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk_supervisor,

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

  /** Can upload ID documents — Front Desk+ */
  canUploadDocuments: (role: AppRole | null) =>
    !!role && ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.front_desk,

  /** Is a staff member (not guest) */
  isStaff: (role: AppRole | null) =>
    !!role && role !== "guest",
} as const;
