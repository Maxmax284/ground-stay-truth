import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES, changeLanguage } from "@/i18n";
import { markLanguageChosenByUser } from "@/hooks/useLanguagePreference";

/** The two languages the camp actually runs on. */
const STAFF_LANGUAGES = ["en", "th"] as const;

/**
 * Each staff member's own reading language, exactly like the guest picker but
 * scoped to the working languages of the desk: English and Thai.
 *
 * The choice is per person, applies instantly and is saved to their account so
 * it follows them to any device. Guests keep writing in their own language —
 * their messages are translated into whichever of these two is chosen here.
 */
export function StaffLanguagePicker() {
  const { t, i18n } = useTranslation();

  const langs = SUPPORTED_LANGUAGES.filter((l) => (STAFF_LANGUAGES as readonly string[]).includes(l.code));
  const active = langs.find((l) => i18n.language === l.code || i18n.language?.startsWith(l.code));

  const pick = (code: string) => {
    if (code === active?.code) return;
    markLanguageChosenByUser();
    void changeLanguage(code);
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("staffLanguage.title", "Your display language")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "staffLanguage.subtitle",
                "Your own choice, saved to your account. Guest messages are shown to you in this language, and your replies reach the guest in theirs.",
              )}
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("staffLanguage.title", "Your display language") as string}
        >
          {langs.map((l) => {
            const selected = l.code === active?.code;
            return (
              <Button
                key={l.code}
                type="button"
                size="sm"
                lang={l.code}
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                className="h-8 gap-1.5 text-xs"
                onClick={() => pick(l.code)}
              >
                <span aria-hidden="true">{l.flag}</span>
                <span>{l.label}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default StaffLanguagePicker;
