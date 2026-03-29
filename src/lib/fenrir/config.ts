/**
 * Fenrir Lock integration configuration.
 * API key and endpoint are stored in policy_settings (admin-managed).
 * Feature flags allow disabling telemetry without code changes.
 */

export interface FenrirConfig {
  enabled: boolean;
  endpoint: string;
  batchIntervalMs: number;
  maxBatchSize: number;
  maxRetries: number;
}

/** Default config — used when policy_settings haven't loaded yet */
export const DEFAULT_FENRIR_CONFIG: FenrirConfig = {
  enabled: false,
  endpoint: "",
  batchIntervalMs: 5000,
  maxBatchSize: 50,
  maxRetries: 3,
};

/** Policy settings keys for Fenrir config */
export const FENRIR_POLICY_KEYS = {
  enabled: "fenrir_enabled",
  endpoint: "fenrir_endpoint",
  freezeActive: "security_freeze_active",
  threatLevel: "security_threat_level",
} as const;
