/**
 * Missing-key safety net.
 *
 * i18next already falls back to English when a translation is absent, but if a
 * key is missing from English too the raw path (`payments.payOnArrival`) leaks
 * into the UI. That is what guests and staff must never see.
 *
 * `humanizeKey` turns the last segment of a key into readable English, and the
 * registry keeps one entry per missing key so admins/devs can see what still
 * needs copy without spamming the console.
 */

export interface MissingKeyEntry {
  key: string;
  languages: string[];
  firstSeen: string;
}

const registry = new Map<string, MissingKeyEntry>();

/** `payments.payOnArrival` -> `Pay on arrival` */
export function humanizeKey(key: string): string {
  const last = key.split(".").pop() ?? key;
  const spaced = last
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function recordMissingKey(languages: string[], key: string) {
  const existing = registry.get(key);
  if (existing) {
    for (const lng of languages) {
      if (!existing.languages.includes(lng)) existing.languages.push(lng);
    }
    return;
  }
  registry.set(key, {
    key,
    languages: [...languages],
    firstSeen: new Date().toISOString(),
  });
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing key: ${key} (${languages.join(", ")})`);
  }
}

export function getMissingKeys(): MissingKeyEntry[] {
  return Array.from(registry.values());
}

export function clearMissingKeys() {
  registry.clear();
}
