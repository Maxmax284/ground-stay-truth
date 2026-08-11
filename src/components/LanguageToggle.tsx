import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, changeLanguage } from "@/i18n";
import { markLanguageChosenByUser } from "@/hooks/useLanguagePreference";
import { Globe } from "lucide-react";

/**
 * Compact language dropdown that sits next to the theme toggle.
 *
 * Accessibility notes:
 * - Radix handles roving focus, Home/End, type-ahead and Escape natively.
 * - The list is a radio group so screen readers announce the selected
 *   language instead of us faking it with a checkmark glyph.
 * - The trigger exposes the active language in its accessible name.
 */
export function LanguageToggle() {
  const { i18n } = useTranslation();

  const active =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l.code));

  const handleChange = (code: string) => {
    markLanguageChosenByUser();
    void changeLanguage(code);
  };

  const triggerLabel = active
    ? `Language: ${active.label}. Change language`
    : "Choose language";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[180px]"
        aria-label="Select a language"
        loop
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Language
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={active?.code ?? i18n.language}
          onValueChange={handleChange}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenuRadioItem
              key={lang.code}
              value={lang.code}
              textValue={lang.label}
              lang={lang.code}
            >
              <span className="mr-2" aria-hidden="true">
                {lang.flag}
              </span>
              <span className="flex-1">{lang.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
