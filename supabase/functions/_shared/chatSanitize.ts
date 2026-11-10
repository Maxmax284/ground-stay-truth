// Normalize caller-supplied chat history before it reaches a model:
// only user/assistant roles, string content, bounded size. System prompts
// are always built server-side.
export function sanitizeChatMessages(input: unknown, maxMessages = 40, maxChars = 8000): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of input.slice(-maxMessages)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as any).role === "assistant" ? "assistant" : "user";
    const raw = (m as any).content;
    const content = typeof raw === "string" ? raw : Array.isArray(raw)
      ? raw.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n")
      : "";
    if (!content) continue;
    out.push({ role, content: content.slice(0, maxChars) });
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function asUuid(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

export const SUPPORTED_LANGS: Record<string, string> = {
  en: "English", th: "Thai", fr: "French", de: "German", es: "Spanish",
  ja: "Japanese", ko: "Korean", ru: "Russian", zh: "Chinese",
};
/** Returns a known language name, or null when the input is not allow-listed. */
export function safeLanguageName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase().slice(0, 2);
  if (SUPPORTED_LANGS[k] && (v.length <= 2 || v.toLowerCase().startsWith(k + "-") || Object.values(SUPPORTED_LANGS).some((n) => n.toLowerCase() === v.toLowerCase()))) return SUPPORTED_LANGS[k];
  const byName = Object.values(SUPPORTED_LANGS).find((n) => n.toLowerCase() === v.trim().toLowerCase());
  return byName ?? null;
}
