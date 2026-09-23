/**
 * Optional language suggestion.
 *
 * HARD RULE: the only evidence we use is what the person's own device asks for
 * (navigator.languages) plus their explicit past choice. We never infer language,
 * nationality or citizenship from an origin airport, an itinerary, a phone number
 * or a passport. A flight from Paris says nothing about what someone reads.
 *
 * The suggestion is always opt-in, always dismissible, and never switches
 * anything on its own.
 */
import { GUEST_READY_LANGUAGES } from "@/i18n/guestSurface";

export interface SuggestArgs {
  /** navigator.languages, e.g. ["fr-FR", "en-US"]. */
  deviceLocales: readonly string[];
  /** Language currently rendering. */
  currentLanguage: string;
  /** Codes the person already said no to. */
  dismissedCodes?: readonly string[];
  /** True once the person picked a language by hand — then we stay quiet. */
  chosenByUser?: boolean;
}

/** Base code of a locale tag: "fr-FR" -> "fr", "zh-Hans-CN" -> "zh". */
export function baseLanguage(tag: string): string {
  return (tag || "").toLowerCase().split(/[-_]/)[0];
}

/**
 * Returns a language code worth offering, or null to stay silent.
 * Only languages complete enough for a guest are ever offered.
 */
export function suggestLanguage({
  deviceLocales,
  currentLanguage,
  dismissedCodes = [],
  chosenByUser = false,
}: SuggestArgs): string | null {
  if (chosenByUser) return null;

  const current = baseLanguage(currentLanguage);
  const dismissed = new Set(dismissedCodes.map(baseLanguage));

  for (const tag of deviceLocales) {
    const code = baseLanguage(tag);
    if (!code) continue;
    if (code === current) return null; // device already agrees — nothing to offer
    if (dismissed.has(code)) continue;
    if ((GUEST_READY_LANGUAGES as readonly string[]).includes(code)) return code;
  }
  return null;
}

const DISMISS_KEY = "gs-language-suggestion-dismissed";

export function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberDismissed(code: string) {
  try {
    const next = Array.from(new Set([...readDismissed(), code]));
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the banner may reappear next session, which is harmless */
  }
}
