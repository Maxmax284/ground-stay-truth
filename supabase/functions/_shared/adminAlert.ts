// Shared helper so any edge function can raise an Admin Alert Command Center
// event. Mirrors public.emit_admin_alert() on the database side.
//
// Fire-and-forget by design: an alert must never break the operation that
// triggered it. All failures are logged and swallowed.
export async function emitAdminAlert(
  eventType: string,
  message: string,
  opts: {
    referenceId?: string | null;
    deepLink?: string | null;
    context?: Record<string, unknown>;
    triggeredBy?: string;
  } = {},
): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const token = Deno.env.get("ADMIN_ALERT_INTERNAL_TOKEN");
  if (!url || !token) {
    console.warn("[adminAlert] not configured, skipping:", eventType);
    return;
  }
  try {
    const resp = await fetch(`${url}/functions/v1/emit-admin-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        internal_token: token,
        event_type: eventType,
        message: message.slice(0, 500),
        reference_id: opts.referenceId ?? null,
        deep_link: opts.deepLink ?? null,
        context: opts.context ?? {},
        triggered_by: opts.triggeredBy ?? "system",
      }),
    });
    if (!resp.ok) {
      console.warn(`[adminAlert] ${eventType} rejected: ${resp.status}`);
    }
  } catch (e) {
    console.warn(`[adminAlert] ${eventType} dispatch failed:`, e);
  }
}
