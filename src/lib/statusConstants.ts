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

// ── Airport Pickup Statuses ──
// CHECK: requested | assigned | confirmed | completed | failed | cancelled
export const PICKUP_STATUSES = [
  "requested",
  "assigned",
  "confirmed",
  "completed",
  "failed",
  "cancelled",
] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

// ── Assist Modes (airport pickups) ──
export const ASSIST_MODES = [
  "healthy",
  "degraded",
  "manual_assist",
  "recovery_pending",
] as const;
export type AssistMode = (typeof ASSIST_MODES)[number];

// ── Arrival Types (unified arrival model) ──
// CHECK: flight | ferry | bus | hybrid | unknown
export const ARRIVAL_TYPES = [
  "flight",
  "ferry",
  "bus",
  "hybrid",
  "unknown",
] as const;
export type ArrivalType = (typeof ARRIVAL_TYPES)[number];

// CHECK: airport | pier | other
export const ARRIVAL_LOCATION_TYPES = [
  "airport",
  "pier",
  "other",
] as const;
export type ArrivalLocationType = (typeof ARRIVAL_LOCATION_TYPES)[number];

// CHECK: high | flexible | unknown
export const ARRIVAL_CONFIDENCE_LEVELS = [
  "high",
  "flexible",
  "unknown",
] as const;
export type ArrivalConfidence = (typeof ARRIVAL_CONFIDENCE_LEVELS)[number];

// CHECK: pickup | self_arrival
export const TRANSPORT_INTENTS = [
  "pickup",
  "self_arrival",
] as const;
export type TransportIntent = (typeof TRANSPORT_INTENTS)[number];
