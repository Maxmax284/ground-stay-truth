import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useState, useCallback } from "react";

interface TranslationResult {
  translated_text: string;
  source_language: string;
}

// Client-side cache for translations
const translationCache = new Map<string, TranslationResult>();

function getCacheKey(text: string, targetLang: string) {
  return `${targetLang}:${text.slice(0, 100)}:${text.length}`;
}

export function useMessageTranslation() {
  const { session } = useAuth();
  const [translations, setTranslations] = useState<Record<string, TranslationResult>>({});
  // Ids whose last translation attempt failed, so the UI can say so plainly
  // instead of silently showing the untranslated original.
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const translateMutation = useMutation({
    mutationFn: async ({ messageId, text, targetLanguage }: { messageId: string; text: string; targetLanguage: string }) => {
      const cacheKey = getCacheKey(text, targetLanguage);
      const cached = translationCache.get(cacheKey);
      if (cached) return { messageId, result: cached };

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ text, target_language: targetLanguage }),
        }
      );

      if (!resp.ok) {
        throw new Error("Translation failed");
      }

      const result: TranslationResult = await resp.json();
      translationCache.set(cacheKey, result);
      return { messageId, result };
    },
    onMutate: ({ messageId }) => {
      setPendingId(messageId);
      setFailedIds((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    },
    onSuccess: ({ messageId, result }) => {
      setTranslations((prev) => ({ ...prev, [messageId]: result }));
    },
    onError: (_error, { messageId }) => {
      setFailedIds((prev) => ({ ...prev, [messageId]: true }));
    },
    onSettled: () => setPendingId(null),
  });

  const translate = useCallback((messageId: string, text: string, targetLanguage: string) => {
    translateMutation.mutate({ messageId, text, targetLanguage });
  }, [translateMutation]);

  const clearTranslation = useCallback((messageId: string) => {
    setTranslations((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  }, []);

  return {
    translations,
    translate,
    clearTranslation,
    failedIds,
    pendingId,
    isTranslating: translateMutation.isPending,
  };
}
