import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES, changeLanguage } from "@/i18n";
import { markLanguageChosenByUser } from "@/hooks/useLanguagePreference";
import { isGuestReady } from "@/i18n/guestSurface";

/**
 * The guest's own language choice, in the portal where they'll actually look
 * for it.
 *
 * The choice is theirs and nothing else's: no language is ever inferred from an
 * airport, a phone number or a passport. Picking here saves the choice to the
 * guest's profile, which is also what the front desk's replies get translated
 * into — staff keep reading and writing in English or Thai.
 *
 * Fully translated languages come first; the rest are offered honestly as
 * partly translated rather than hidden or oversold.
 */
export function GuestLanguagePicker() {
  const { t, i18n } = useTranslation();

  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l.code));

  const ready = SUPPORTED_LANGUAGES.filter((l) => isGuestReady(l.code));
  const partial = SUPPORTED_LANGUAGES.filter((l) => !isGuestReady(l.code));

  const pick = (code: string) => {
    if (code === current?.code) return;
    markLanguageChosenByUser();
    void changeLanguage(code);
  };

  const renderButton = (lang: (typeof SUPPORTED_LANGUAGES)[number], full: boolean) => {
    const active = lang.code === current?.code;
    return (
      <Button
        key={lang.code}
        type="button"
        size="sm"
        variant={active ? "default" : "outline"}
        aria-pressed={active}
        lang={lang.code}
        className="h-8 gap-1.5 text-xs"
        onClick={() => pick(lang.code)}
      >
        <span aria-hidden="true">{lang.flag}</span>
        <span>{lang.label}</span>
        {!full && (
          <span className="text-[10px] uppercase tracking-wide opacity-70">
            {t("language.suggestion.partial", "Partly translated")}
          </span>
        )}
      </Button>
    );
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("guestLanguage.title", "Your language")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "guestLanguage.subtitle",
                "Write to us in your own language. The front desk works in English or Thai and you'll read their replies in yours.",
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t("guestLanguage.title", "Your language") as string}>
          {ready.map((l) => renderButton(l, true))}
        </div>

        {partial.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              {t("guestLanguage.partialNote", "These are still being translated — some text stays in English.")}
            </p>
            <div className="flex flex-wrap gap-2">{partial.map((l) => renderButton(l, false))}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
