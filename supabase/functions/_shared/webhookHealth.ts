// Tiny helper for updating the webhook_health snapshot row.
// Called from payment-webhook on every event (success or failure).

export async function recordWebhookEvent(
  adminClient: any,
  provider: string,
  outcome: "success" | "failure",
  opts: { eventId?: string | null; reason?: string | null } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, any> = {
    provider,
    last_received_at: now,
    last_event_id: opts.eventId ?? null,
    updated_at: now,
  };
  if (outcome === "success") {
    patch.last_success_at = now;
    patch.status = "healthy";
  } else {
    patch.last_failure_at = now;
    patch.last_failure_reason = (opts.reason ?? "unknown").slice(0, 500);
    patch.status = "failing";
  }
  try {
    await adminClient
      .from("webhook_health")
      .upsert(patch, { onConflict: "provider" });
  } catch (err) {
    console.error("[webhook_health] update failed:", err);
  }
}
