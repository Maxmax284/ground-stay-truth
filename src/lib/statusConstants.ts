/**
 * Canonical status values for tables with CHECK constraints.
 * Keep in sync with database constraints.
 */

export const LAUNDRY_STATUSES = [
  "requested",
  "collected",
  "washing",
  "drying",
  "folded",
  "returned",
  "cancelled",
] as const;
export type LaundryStatus = (typeof LAUNDRY_STATUSES)[number];

export const MAINTENANCE_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "cancelled",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_PRIORITIES = [
  "low",
  "medium",
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

export const HOUSEKEEPING_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const;
export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUSES)[number];

export const PICKUP_STATUSES = [
  "pending",
  "confirmed",
  "driver_assigned",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

export const DOCUMENT_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
  "expired",
  "waived",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
