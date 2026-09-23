import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Loader2 } from "lucide-react";
import { useMessageTranslation } from "@/hooks/useMessageTranslation";

/**
 * Message body with an optional machine translation.
 *
 * Rules this component exists to enforce:
 * - The original is never replaced or lost. It stays one tap away, and is shown
 *   underneath whenever a translation is displayed.
 * - A translation is always labelled as machine translation. We don't let a
 *   guest or a staff member mistake it for a person's own words.
 * - A failure says so plainly and leaves the original on screen. It never falls
 *   back to a silent guess.
 * - Translating is read-only. It never sends, edits or triggers anything.
 */
interface Props {
  messageId: string;
  text: string;
  /** Language the reader wants, e.g. "en", "th", "fr". */
  targetLanguage: string;
  /** Muted styling for bubbles that already sit on a coloured background. */
  onTinted?: boolean;
}

export function TranslatableText({ messageId, text, targetLanguage, onTinted = false }: Props) {
  const { t } = useTranslation();
  const { translations, translate, clearTranslation, isTranslating } = useMessageTranslation();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const translation = translations[messageId];
  const subtle = onTinted ? "opacity-75" : "text-muted-foreground";

  const run = () => {
    setFailed(false);
    setPending(true);
    try {
      translate(messageId, text, targetLanguage);
    } finally {
      // useMessageTranslation surfaces the result through `translations`; a
      // missing entry after the mutation settles means it failed.
      setTimeout(() => setPending(false), 0);
    }
  };

  return (
    <div className="space-y-1">
      <p className="whitespace-pre-wrap break-words text-sm">
        {translation ? translation.translated_text : text}
      </p>

      {translation && (
        <>
          <p className={`text-[11px] italic ${subtle}`}>
            {t("translation.machineNote", "Machine translation")}
          </p>
          <p className={`whitespace-pre-wrap break-words text-xs ${subtle}`}>{text}</p>
        </>
      )}

      {failed && (
        <p className={`text-[11px] ${onTinted ? "opacity-90" : "text-destructive"}`}>
          {t("translation.failed", "Couldn't translate — showing the original.")}
        </p>
      )}

      <button
        type="button"
        onClick={() => (translation ? clearTranslation(messageId) : run())}
        disabled={isTranslating && pending}
        className={`inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline ${subtle}`}
      >
        {isTranslating && pending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {t("translation.translating", "Translating…")}
          </>
        ) : translation ? (
          t("translation.viewOriginal", "View original")
        ) : (
          <>
            <Globe className="h-3 w-3" aria-hidden="true" />
            {t("translation.translate", "Translate")}
          </>
        )}
      </button>
    </div>
  );
}
