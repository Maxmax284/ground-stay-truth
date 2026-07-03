/**
 * Fenrir Lock outbound helper — one-way doctrine.
 *
 *   GroundStay  ──signed events──▶  Fenrir Lock
 *   Fenrir Lock  ─X─ cannot control ─X─  GroundStay
 *
 * Responsibilities:
 *   1. Allowlist internal event names (unknown types are rejected).
 *   2. Map legacy internal names to the Fenrir dotted namespace envelope.
 *   3. Minimize PII (hash actor_email, bucket amounts, drop raw guest data).
 *   4. Stamp correlation / environment / platform metadata.
 *   5. Read the API key server-side only (integration_secrets, env fallback).
 *   6. Never throw into the caller — Fenrir downtime must not break ops.
 */

// deno-lint-ignore-file no-explicit-any

// Ambient declaration so this file also type-checks under Node/Vitest
// (it runs in Deno inside edge functions).
declare const Deno: { env: { get(k: string): string | undefined } };

import {
  FENRIR_EVENT_MAP,
  scrubDetails,
  type FenrirSeverity,
} from "./fenrir-mapper.ts";

export { FENRIR_EVENT_MAP, scrubDetails };
export type { FenrirSeverity };

export interface InternalFenrirEvent {
  event_type: string;
  severity: FenrirSeverity;
  confidence_score?: number;
  user_email?: string;
  details?: Record<string, unknown>;
  source_ip?: string;
  timestamp?: string;
}

interface DispatchDeps {
  supabase: any;
  environment?: "staging" | "production";
  correlationId?: string;
}

/**
 * Server-side entry point. Returns silently on any failure — Fenrir outage
 * must never break GroundStay operations.
 */
export async function sendFenrirSecurityEvent(
  event: InternalFenrirEvent,
  { supabase, environment = "staging", correlationId }: DispatchDeps,
): Promise<{ status: "sent" | "logged" | "rejected" | "skipped"; reason?: string }> {
  try {
    const dotted = FENRIR_EVENT_MAP[event.event_type];
    if (!dotted) {
      return { status: "rejected", reason: `unknown event_type: ${event.event_type}` };
    }

    // Read config server-side only
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", ["fenrir_enabled", "fenrir_endpoint"]);

    const policyMap = new Map<string, string>(
      (policies ?? []).map((p: any) => [
        String(p.key),
        String(p.value).replace(/^"|"$/g, ""),
      ]),
    );
    const enabled = policyMap.get("fenrir_enabled") === "true";
    const endpoint = policyMap.get("fenrir_endpoint") ?? "";

    const safeDetails = await scrubDetails(event.details ?? {});
    const envelope = {
      event_type: dotted,
      internal_event_type: event.event_type,
      severity: event.severity,
      confidence_score: event.confidence_score ?? 50,
      source_platform: "groundstay",
      platform_version: "groundstay-1.0",
      environment,
      correlation_id: correlationId ?? crypto.randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      details: safeDetails,
    };

    // Always log locally for audit trail (no PII: we log the scrubbed envelope)
    await supabase.from("security_events").insert({
      event_type: event.event_type,
      severity: event.severity,
      actor_id: (event.details as any)?.actor_id ?? null,
      actor_role: (event.details as any)?.actor_role ?? null,
      actor_email: null, // never store raw actor email from the outbound path
      confidence_score: envelope.confidence_score,
      details: envelope,
      source_ip: event.source_ip ?? null,
    });

    if (!enabled || !endpoint) {
      return { status: "logged", reason: "fenrir disabled or no endpoint" };
    }

    const { data: secretRow } = await supabase
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "fenrir_api_key")
      .maybeSingle();
    const apiKey = secretRow?.encrypted_value || Deno.env.get("FENRIR_API_KEY") || "";
    if (!apiKey) return { status: "logged", reason: "no api key configured" };

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Connector-Key": apiKey,
          "x-groundstay-environment": environment,
        },
        body: JSON.stringify(envelope),
      });
      if (!resp.ok) return { status: "logged", reason: `http ${resp.status}` };
      return { status: "sent" };
    } catch (err) {
      return { status: "logged", reason: `network: ${(err as Error).message}` };
    }
  } catch (err) {
    console.error("[fenrir] helper failure (swallowed):", err);
    return { status: "skipped", reason: (err as Error).message };
  }
}
