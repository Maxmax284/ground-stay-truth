import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, changeLanguage } from "@/i18n";
import { markLanguageChosenByUser } from "@/hooks/useLanguagePreference";
import { Globe } from "lucide-react";

/**
 * Compact language dropdown that sits next to the theme toggle.
 *
 * One tap opens the list; guests/staff pick the exact language without
 * cycling through every option.
 */
export function LanguageToggle() {
  const { i18n } = useTranslation();

  const handleChange = (code: string) => {
    markLanguageChosenByUser();
    void changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Choose language"
          title="Choose language"
        >
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={i18n.language === lang.code ? "bg-accent" : ""}
          >
            <span className="mr-2">{lang.flag}</span>
            <span className="flex-1">{lang.label}</span>
            {i18n.language === lang.code && (
              <span className="ml-2 text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
