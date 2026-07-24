// Shared messaging failure classifier + retry helper.
// Mirrors the pattern used by send-transactional-email so the Monitoring
// Center can group / prioritize failures across every outbound channel.

export type MessagingChannel = "telegram" | "whatsapp" | "line" | "sms";

export type ErrorCategory =
  | "auth"          // 401/403 token invalid — permanent, admin action needed
  | "not_configured" // secret missing — permanent
  | "invalid_recipient" // 400 bad chat_id / phone — permanent
  | "rate_limit"    // 429 — retryable w/ backoff
  | "server"        // 5xx — retryable
  | "network"       // fetch threw — retryable
  | "provider_reject" // 4xx other — permanent
  | "unknown";

export type Severity = "attention" | "warning" | "info";

export interface SendResult {
  ok: boolean;
  error?: string;
  category?: ErrorCategory;
  code?: string;          // stringified http status or provider code
  provider_response?: unknown;
  retry_count?: number;
  severity?: Severity;
}

export function classifyMessagingError(
  status: number | null,
  body: string,
  channel: MessagingChannel,
): { category: ErrorCategory; severity: Severity; retryable: boolean } {
  if (status === null) return { category: "network", severity: "warning", retryable: true };
  if (status === 401 || status === 403) return { category: "auth", severity: "attention", retryable: false };
  if (status === 429) return { category: "rate_limit", severity: "warning", retryable: true };
  if (status >= 500) return { category: "server", severity: "warning", retryable: true };

  const lower = body.toLowerCase();
  if (status === 400) {
    if (
      lower.includes("chat not found") ||
      lower.includes("user not found") ||
      lower.includes("invalid 'to'") ||
      lower.includes("not a valid phone") ||
      lower.includes("recipient")
    ) {
      return { category: "invalid_recipient", severity: "attention", retryable: false };
    }
  }
  if (status >= 400 && status < 500) {
    return { category: "provider_reject", severity: "attention", retryable: false };
  }
  return { category: "unknown", severity: "warning", retryable: true };
}

// Runs `attempt` up to `maxAttempts` with exponential backoff (500ms → 2s).
// Never throws — always resolves to a SendResult you can log directly.
export async function sendWithRetry(
  channel: MessagingChannel,
  attempt: () => Promise<{ ok: boolean; status?: number | null; body?: string; provider_response?: unknown }>,
  opts: { maxAttempts?: number } = {},
): Promise<SendResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let last: SendResult = { ok: false, category: "unknown", severity: "warning", retry_count: 0 };

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await attempt();
      if (r.ok) {
        return { ok: true, retry_count: i, provider_response: r.provider_response };
      }
      const status = r.status ?? null;
      const body = r.body ?? "";
      const c = classifyMessagingError(status, body, channel);
      last = {
        ok: false,
        error: `${channel} ${status ?? "network"}: ${body.slice(0, 200)}`,
        category: c.category,
        code: status ? String(status) : undefined,
        provider_response: r.provider_response,
        retry_count: i,
        severity: c.severity,
      };
      if (!c.retryable) return last;
    } catch (e) {
      last = {
        ok: false,
        error: `${channel} network: ${e instanceof Error ? e.message : String(e)}`,
        category: "network",
        retry_count: i,
        severity: "warning",
      };
    }
    // backoff before next attempt
    if (i < maxAttempts - 1) {
      const delay = 500 * Math.pow(2, i); // 500ms, 1s, 2s
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  return last;
}
