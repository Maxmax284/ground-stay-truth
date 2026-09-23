import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { changeLanguage, SUPPORTED_LANGUAGES } from "@/i18n";
import { markLanguageChosenByUser } from "@/hooks/useLanguagePreference";
import { suggestLanguage, readDismissed, rememberDismissed } from "@/lib/languageSuggestion";

/**
 * A single quiet offer: "your device is set to Français — read this in Français?"
 *
 * It appears at most once per language, is dismissible, and changes nothing until
 * the guest taps it. The suggestion comes from the device's own language setting
 * — never from where a flight happens to depart.
 */
export function LanguageSuggestionBanner() {
  const { t, i18n } = useTranslation();
  const [hidden, setHidden] = useState(false);

  const locales = useMemo(
    () => (typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [navigator.language])].filter(Boolean)),
    [],
  );

  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    try {
      setChosen(localStorage.getItem("gs-language-explicit") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const code = suggestLanguage({
    deviceLocales: locales,
    currentLanguage: i18n.language || "en",
    dismissedCodes: readDismissed(),
    chosenByUser: chosen,
  });

  if (hidden || !code) return null;
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  if (!lang) return null;

  const accept = () => {
    markLanguageChosenByUser();
    void changeLanguage(code);
    setHidden(true);
  };

  const decline = () => {
    rememberDismissed(code);
    setHidden(true);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 flex flex-wrap items-center gap-2">
      <Languages className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <p className="text-sm flex-1 min-w-[12rem]">
        {t("language.suggestion.prompt", {
          defaultValue: "Prefer to read this in {{language}}?",
          language: lang.label,
        })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={accept} lang={code}>
          {lang.label}
        </Button>
        <Button size="sm" variant="ghost" onClick={decline}>
          {t("language.suggestion.keep", { defaultValue: "No thanks" })}
        </Button>
      </div>
    </div>
  );
}
