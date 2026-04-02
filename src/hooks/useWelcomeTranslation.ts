import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

interface WelcomeSection {
  title: string;
  content: string;
}

interface TranslatedWelcome {
  welcome_message: string;
  sections: WelcomeSection[];
}

const cache = new Map<string, TranslatedWelcome>();

function cacheKey(lang: string, msg: string, sectionCount: number) {
  return `${lang}:${msg.slice(0, 60)}:${sectionCount}`;
}

/**
 * Translates welcome guide content into the guest's preferred language.
 * Returns the original content if language is English or translation fails.
 * Uses the existing translate-message edge function — no new infrastructure.
 */
export function useWelcomeTranslation(
  welcomeMessage: string,
  sections: WelcomeSection[],
) {
  const { session } = useAuth();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const isEnglish = !lang || lang === "en";

  const [translated, setTranslated] = useState<TranslatedWelcome | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const translateText = useCallback(
    async (text: string): Promise<string> => {
      if (!text.trim()) return text;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ text, target_language: lang }),
        },
      );
      if (!resp.ok) throw new Error("Translation failed");
      const result = await resp.json();
      return result.translated_text || text;
    },
    [session?.access_token, lang],
  );

  useEffect(() => {
    if (isEnglish || !welcomeMessage && sections.length === 0) {
      setTranslated(null);
      return;
    }

    const key = cacheKey(lang, welcomeMessage, sections.length);
    const cached = cache.get(key);
    if (cached) {
      setTranslated(cached);
      return;
    }

    let cancelled = false;
    setIsTranslating(true);

    (async () => {
      try {
        // Translate welcome message + all section titles/content in parallel
        const promises: Promise<string>[] = [
          translateText(welcomeMessage),
          ...sections.flatMap((s) => [
            translateText(s.title),
            translateText(s.content),
          ]),
        ];

        const results = await Promise.all(promises);
        if (cancelled) return;

        const translatedMsg = results[0];
        const translatedSections: WelcomeSection[] = sections.map((_, i) => ({
          title: results[1 + i * 2],
          content: results[2 + i * 2],
        }));

        const out: TranslatedWelcome = {
          welcome_message: translatedMsg,
          sections: translatedSections,
        };

        cache.set(key, out);
        setTranslated(out);
      } catch (e) {
        console.error("Welcome translation failed, showing original:", e);
        if (!cancelled) setTranslated(null);
      } finally {
        if (!cancelled) setIsTranslating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEnglish, lang, welcomeMessage, sections, translateText]);

  return { translated, isTranslating, needsTranslation: !isEnglish };
}
