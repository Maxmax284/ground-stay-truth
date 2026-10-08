/** Shared phone/WhatsApp link helpers — one formatter for Settings, guest card and Front Desk. */

/** Normalize to E.164 (+CC…). Returns null if not a valid international number. */
export function normalizeIntlPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  return s;
}

const digits = (n: string) => n.replace(/[^\d]/g, "");

export const toWaLink = (n: string | null | undefined) => (n ? `https://wa.me/${digits(n)}` : null);
export const toTelLink = (n: string | null | undefined) => (n ? `tel:+${digits(n)}` : null);
