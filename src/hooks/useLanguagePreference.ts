/**
 * Language persistence.
 *
 * Local storage stays the fast path (instant on boot, works signed out).
 * `profiles.preferred_language` is the durable copy so staff and guests don't
 * re-pick their language on every device or session.
 *
 * Rules:
 * - If the user explicitly picked a language on this device, that wins and gets
 *   pushed to the profile.
 * - Otherwise the profile value is applied on sign-in.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { changeLanguage, SUPPORTED_LANGUAGES } from "@/i18n";

const EXPLICIT_FLAG = "gs-language-explicit";

export function markLanguageChosenByUser() {
  try {
    localStorage.setItem(EXPLICIT_FLAG, "1");
  } catch {
    /* private mode — ignore */
  }
}

function wasChosenByUser() {
  try {
    return localStorage.getItem(EXPLICIT_FLAG) === "1";
  } catch {
    return false;
  }
}

function isSupported(code?: string | null): boolean {
  return !!code && SUPPORTED_LANGUAGES.some((l) => l.code === code);
}

export function useLanguagePreference() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      const remote = data?.preferred_language ?? null;
      const local = i18n.language;

      if (wasChosenByUser() || !isSupported(remote)) {
        // Device choice is authoritative — persist it upstream once.
        if (isSupported(local) && remote !== local && synced.current !== local) {
          synced.current = local;
          await supabase
            .from("profiles")
            .update({ preferred_language: local })
            .eq("user_id", user.id);
        }
        return;
      }

      if (remote !== local) await changeLanguage(remote!);
    })();

    return () => {
      cancelled = true;
    };
    // i18n.language intentionally tracked so a mid-session switch is persisted
  }, [user, i18n.language]);
}

/** Mount-once component so the sync runs inside the auth provider. */
export function LanguagePreferenceSync() {
  useLanguagePreference();
  return null;
}
