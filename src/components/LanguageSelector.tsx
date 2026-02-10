import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, changeLanguage } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

interface LanguageSelectorProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSelector({ compact = false, className }: LanguageSelectorProps) {
  const { i18n } = useTranslation();

  return (
    <Select value={i18n.language} onValueChange={changeLanguage}>
      <SelectTrigger className={className ?? (compact ? "w-[52px] h-8 px-2" : "w-[150px] h-8")}>
        {compact ? (
          <Globe className="h-3.5 w-3.5" />
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            <span className="flex items-center gap-2">
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
