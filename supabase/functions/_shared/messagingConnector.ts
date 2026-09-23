// =============================================================================
// ⚠️  CONNECTOR SEAM — NOT LINKED YET  ⚠️
// -----------------------------------------------------------------------------
// This is the single place outbound WhatsApp leaves CampStay once the Lovable
// WhatsApp Business connector is linked. Everything else in the messaging stack
// is finished and calls through here, so linking the connector is a one-step
// job with no further code changes:
//
//   TODO(connector): link the Lovable WhatsApp Business connector for Lamai.
//     1. Link it (creates WHATSAPP_API_KEY in this project).
//     2. Nothing else. sendGuestWhatsApp() starts delivering automatically.
//
// Until both LOVABLE_API_KEY and WHATSAPP_API_KEY exist, every call returns
// { ok: false, reason: "connector_not_linked" } and the caller falls back to
// email. No throw, no retry storm, no half-sent state.
//
// RULE OF LAW: this pipe only delivers text. It never mutates bookings,
// payments, pickups or check-in state. Messaging feeds the system; it does not
// control it.
// =============================================================================

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; reason: "connector_not_linked" | "no_recipient" | "provider_error"; detail?: string };

/** True once the connector is linked and outbound WhatsApp can actually leave. */
export function whatsAppConnectorLinked(): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("WHATSAPP_API_KEY"));
}

/** Digits-only E.164 (no leading +), as the Graph API expects. */
export function normaliseRecipient(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Sends a free-form text message to a guest inside the 24-hour customer-service
 * window. Business-initiated messages outside that window need an approved
 * template — that is a separate, connector-time decision, deliberately not
 * guessed at here.
 */
export async function sendGuestWhatsApp(
  toRaw: string | null | undefined,
  text: string,
): Promise<WhatsAppSendResult> {
  const to = normaliseRecipient(toRaw);
  if (!to) return { ok: false, reason: "no_recipient" };
  if (!whatsAppConnectorLinked()) return { ok: false, reason: "connector_not_linked" };

  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const connectionKey = Deno.env.get("WHATSAPP_API_KEY")!;

  try {
    const resp = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(0, 3500) },
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      console.error(`[whatsapp] gateway send failed [${resp.status}]: ${raw}`);
      return { ok: false, reason: "provider_error", detail: `${resp.status}: ${raw.slice(0, 300)}` };
    }
    let providerMessageId: string | null = null;
    try {
      providerMessageId = JSON.parse(raw)?.messages?.[0]?.id ?? null;
    } catch { /* body shape is provider-owned; id is optional */ }
    return { ok: true, providerMessageId };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp] gateway dispatch threw:", detail);
    return { ok: false, reason: "provider_error", detail };
  }
}
