import { useTranslation } from "react-i18next";
import { Globe, Loader2 } from "lucide-react";
import { useMessageTranslation } from "@/hooks/useMessageTranslation";
import { useAuth } from "@/hooks/useAuth";

/**
 * Message body with an optional machine translation.
 *
 * Rules this component exists to enforce:
 * - The original is never replaced or lost. It stays one tap away, and is shown
 *   underneath whenever a translation is displayed.
 * - A translation is always labelled as machine translation, so nobody mistakes
 *   it for a person's own words.
 * - A failure says so plainly and leaves the original on screen. No silent guess.
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
  const { translations, translate, clearTranslation, failedIds, pendingId } =
    useMessageTranslation();
  const { session } = useAuth();
  // Translation needs a signed-in session. Rather than offering a button that
  // can only fail (e.g. a driver on a link-only page), we don't offer it.
  const canTranslate = !!session?.access_token;

  const translation = translations[messageId];
  const failed = !!failedIds[messageId];
  const busy = pendingId === messageId;
  const subtle = onTinted ? "opacity-75" : "text-muted-foreground";

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

      {canTranslate && (
      <button
        type="button"
        onClick={() =>
          translation ? clearTranslation(messageId) : translate(messageId, text, targetLanguage)
        }
        disabled={busy}
        className={`inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline ${subtle}`}
      >
        {busy ? (
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
