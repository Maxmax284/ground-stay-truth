import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES, changeLanguage } from "@/i18n";
import { markLanguageChosenByUser } from "@/hooks/useLanguagePreference";

/**
 * Compact language toggle button that cycles through supported languages.
 *
 * Designed to sit next to the theme toggle in the guest header so switching
 * language is a single tap, not a dropdown menu drill.
 */
export function LanguageToggle() {
  const { i18n } = useTranslation();

  const cycleLanguage = () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    const idx = codes.indexOf(i18n.language as (typeof codes)[number]);
    const next = codes[(idx + 1) % codes.length];
    markLanguageChosenByUser();
    void changeLanguage(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleLanguage}
      className="h-9 w-9 text-xs font-semibold uppercase tracking-tight"
      aria-label={`Current language: ${i18n.language}. Click to switch.`}
      title="Switch language"
    >
      {i18n.language}
    </Button>
  );
}
