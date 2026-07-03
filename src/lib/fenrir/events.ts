/**
 * Fenrir Lock Event Integration Layer
 *
 * Provides wrapper functions that emit security events
 * when called alongside existing GroundStay operations.
 * Use these in components/hooks to avoid scattering fenrir imports.
 */
import { fenrirDispatcher } from "@/lib/fenrir/dispatcher";
import { mapRole } from "@/lib/fenrir/role-map";
import type { AppRole } from "@/lib/permissions";
import type { FenrirEventType, FenrirSeverity } from "@/lib/fenrir/types";

interface ActorContext {
  userId: string;
  email?: string;
  role: AppRole | null;
}

function baseDetails(actor: ActorContext) {
  return {
    source_platform: "groundstay" as const,
    actor_role: mapRole(actor.role),
    actor_id: actor.userId,
    actor_email: actor.email,
  };
}

function emit(
  eventType: FenrirEventType,
  severity: FenrirSeverity,
  confidence: number,
  actor: ActorContext,
  extra: Record<string, unknown> = {}
) {
  fenrirDispatcher.emit({
    event_type: eventType,
    severity,
    confidence_score: confidence,
    user_email: actor.email,
    details: { ...baseDetails(actor), ...extra },
  });
}

// ── Authentication Events ──

export function emitStaffLogin(actor: ActorContext, method = "password") {
  emit("staff_login", "low", 90, actor, { login_method: method });
}

export function emitStaffLoginFailed(email: string, attemptCount = 1) {
  fenrirDispatcher.emit({
    event_type: "staff_login_failed",
    severity: attemptCount >= 5 ? "high" : "medium",
    confidence_score: 85,
    user_email: email,
    details: {
      source_platform: "groundstay",
      actor_role: mapRole(null),
      actor_id: "unknown",
      actor_email: email,
      attempt_count: attemptCount,
      lockout_triggered: attemptCount >= 5,
    },
  });
}

// ── Privilege Escalation / Role Changes ──

export function emitPrivilegeEscalation(
  actor: ActorContext,
  targetUserId: string,
  targetRole: string,
  action: "added" | "removed"
) {
  emit("privilege_escalation", "high", 95, actor, {
    target_user_id: targetUserId,
    target_role: targetRole,
    action,
  });
}

export function emitRoleChanged(
  actor: ActorContext,
  targetUserId: string,
  targetRole: string,
  action: "added" | "removed"
) {
  emit("role_changed", "medium", 90, actor, {
    target_user_id: targetUserId,
    target_role: targetRole,
    action,
  });
}

// ── Staff Lifecycle ──

export function emitStaffCreated(
  actor: ActorContext,
  targetUserId: string,
  targetRole: string
) {
  emit("staff_created", "high", 95, actor, {
    target_user_id: targetUserId,
    target_role: targetRole,
  });
}

// ── Payment Events ──

export function emitPaymentProcessed(
  actor: ActorContext,
  amount: number,
  method: string,
  bookingId: string,
  currency = "THB"
) {
  emit("payment_processed", "low", 90, actor, {
    amount,
    currency,
    payment_method: method,
    booking_id: bookingId,
  });
}

export function emitPaymentFailed(
  actor: ActorContext,
  amount: number,
  errorCode: string,
  bookingId: string
) {
  emit("payment_failed", "medium", 80, actor, {
    amount,
    error_code: errorCode,
    booking_id: bookingId,
  });
}

export function emitRefundIssued(
  actor: ActorContext,
  amount: number,
  reason: string,
  bookingId: string
) {
  emit("refund_issued", "medium", 90, actor, {
    amount,
    reason,
    booking_id: bookingId,
  });
}

export function emitRateOverride(
  actor: ActorContext,
  originalRate: number,
  newRate: number,
  bookingId: string
) {
  emit("rate_override", "medium", 90, actor, {
    original_rate: originalRate,
    new_rate: newRate,
    booking_id: bookingId,
  });
}

// ── Guest Data Events ──

export function emitGuestDataAccess(
  actor: ActorContext,
  guestId: string,
  fieldsAccessed: string[]
) {
  emit("guest_data_access", "low", 80, actor, {
    guest_id: guestId,
    fields_accessed: fieldsAccessed,
  });
}

export function emitGuestDataModified(
  actor: ActorContext,
  guestId: string,
  fieldsChanged: string[]
) {
  emit("guest_data_modified", "medium", 85, actor, {
    guest_id: guestId,
    fields_changed: fieldsChanged,
  });
}

export function emitBulkGuestExport(
  actor: ActorContext,
  recordCount: number,
  exportFormat: string,
  includesPii: boolean
) {
  emit("bulk_guest_export", "high", 95, actor, {
    record_count: recordCount,
    export_format: exportFormat,
    includes_pii: includesPii,
  });
}

// ── Booking Fraud Signals ──

export function emitBookingFraudFlag(
  actor: ActorContext,
  bookingId: string,
  riskIndicators: string[],
  bookingValue: number
) {
  emit("booking_fraud_flag", "high", 70, actor, {
    booking_id: bookingId,
    risk_indicators: riskIndicators,
    booking_value: bookingValue,
  });
}

// ── After Hours Access ──

export function emitAfterHoursAccess(
  actor: ActorContext,
  accessType: string
) {
  // Business hours: 6 AM - 10 PM local time
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 22) return; // within business hours

  emit("after_hours_access", "medium", 75, actor, {
    access_type: accessType,
    local_hour: hour,
  });
}

// ── System Events ──

export function emitEmergencyFreeze(actor: ActorContext) {
  emit("emergency_freeze", "critical", 100, actor, {
    triggered_by: actor.userId,
  });
}

export function emitEmergencyUnfreeze(actor: ActorContext) {
  emit("emergency_unfreeze", "high", 100, actor, {
    lifted_by: actor.userId,
  });
}

// ── Admin Configuration Audit ──

export function emitPolicySettingChanged(
  actor: ActorContext,
  settingKey: string,
  propertyId: string | null,
) {
  // Values themselves are intentionally not sent — key + scope is enough for Fenrir.
  emit("policy_setting_changed", "medium", 90, actor, {
    setting_key: settingKey,
    property_scope: propertyId ?? "global",
  });
}
