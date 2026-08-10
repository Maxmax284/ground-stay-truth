import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import { humanizeKey, recordMissingKey } from "./missingKeys";


export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "th", label: "ภาษาไทย", flag: "🇹🇭" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const savedLang = localStorage.getItem("gs-language") || "en";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  // Safety net: a key missing everywhere must never render as a raw path.
  saveMissing: true,
  missingKeyHandler: (lngs, _ns, key) => {
    recordMissingKey(Array.isArray(lngs) ? lngs : [String(lngs)], key);
  },
  parseMissingKeyHandler: (key) => humanizeKey(key),
});


// Lazy-load non-English languages
async function loadLanguage(code: string) {
  if (code === "en" || i18n.hasResourceBundle(code, "translation")) return;
  try {
    const module = await import(`./locales/${code}.json`);
    i18n.addResourceBundle(code, "translation", module.default, true, true);
  } catch {
    console.warn(`Language ${code} not yet available, falling back to English`);
  }
}

// Load saved language on init
if (savedLang !== "en") loadLanguage(savedLang);

// Re-export a helper to change language
export async function changeLanguage(code: string) {
  await loadLanguage(code);
  await i18n.changeLanguage(code);
  localStorage.setItem("gs-language", code);
}

export default i18n;
