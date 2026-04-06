/**
 * Canonical status values for tables with CHECK constraints.
 * Keep in sync with database constraints.
 *
 * Run `psql -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c' AND conrelid::regclass::text LIKE 'public.%';"` to verify.
 */

// ── Laundry Requests ──
// CHECK: received | in_progress | ready_for_pickup | collected
export const LAUNDRY_STATUSES = [
  "received",
  "in_progress",
  "ready_for_pickup",
  "collected",
] as const;
export type LaundryStatus = (typeof LAUNDRY_STATUSES)[number];

// ── Maintenance Requests ──
// No CHECK constraint — these are the values used by convention
export const MAINTENANCE_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "cancelled",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "furniture",
  "appliance",
  "pest_control",
  "cleaning",
  "structural",
  "other",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

// ── Housekeeping Tasks ──
export const HOUSEKEEPING_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const;
export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUSES)[number];

// ── Airport Pickups ──
export const PICKUP_STATUSES = [
  "requested",
  "confirmed",
  "driver_assigned",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

// ── Guest Documents ──
export const DOCUMENT_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

// ── Payments ──
export const PAYMENT_STATUSES = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
  "expired",
  "waived",
  "recorded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ── Assist Modes (airport pickups) ──
export const ASSIST_MODES = [
  "healthy",
  "degraded",
  "manual_assist",
  "recovery_pending",
] as const;
export type AssistMode = (typeof ASSIST_MODES)[number];
