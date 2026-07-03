/**
 * Fenrir Lock Security Integration — Event Type Definitions
 * All outbound event payloads conform to the Fenrir Lock ingestion schema.
 */

// ── Severity levels ──
export type FenrirSeverity = "low" | "medium" | "high" | "critical";

// ── Fenrir role values (mapped from GroundStay roles) ──
export type FenrirRole =
  | "owner"
  | "admin"
  | "property_manager"
  | "front_desk"
  | "housekeeping"
  | "maintenance"
  | "guest";

// ── Event type identifiers ──
export type FenrirEventType =
  // Authentication
  | "staff_login"
  | "staff_login_failed"
  | "privilege_escalation"
  | "role_changed"
  | "staff_created"
  // Guest Data
  | "guest_data_access"
  | "guest_data_modified"
  | "bulk_guest_export"
  | "gdpr_request_received"
  // Payment & Financial
  | "payment_processed"
  | "payment_failed"
  | "payment_anomaly"
  | "chargeback_received"
  | "card_testing_detected"
  | "refund_issued"
  | "rate_override"
  | "unauthorized_discount"
  | "webhook_rejected"
  // Access & Security
  | "cross_property_access"
  | "after_hours_access"
  | "key_card_anomaly"
  | "data_residency_violation"
  | "booking_fraud_flag"
  | "guest_complaint_escalated"
  // System
  | "emergency_freeze"
  | "emergency_unfreeze"
  | "ai_kill_switch_engaged"
  // Admin config audit
  | "policy_setting_changed";

// ── Event detail fields ──
export interface FenrirEventDetails {
  source_platform: "groundstay";
  actor_role: FenrirRole;
  actor_id: string;
  actor_email?: string;
  property_id?: string;
  location_id?: string;
  // Dynamic detail fields
  [key: string]: unknown;
}

// ── Full event payload ──
export interface FenrirEvent {
  event_type: FenrirEventType;
  severity: FenrirSeverity;
  source_ip?: string;
  hostname?: string;
  user_email?: string;
  confidence_score: number;
  details: FenrirEventDetails;
  timestamp?: string;
}

// ── Inbound command types from Fenrir Lock ──
export type FenrirCommand =
  | "emergency_freeze"
  | "emergency_unfreeze"
  | "increase_threat_level"
  | "get_system_status";

export interface FenrirCommandPayload {
  command: FenrirCommand;
  reason?: string;
  issued_by?: string;
  metadata?: Record<string, unknown>;
}

export interface FenrirCommandResponse {
  status: "ok" | "error";
  command: FenrirCommand;
  executed_at: string;
  details: Record<string, unknown>;
}
