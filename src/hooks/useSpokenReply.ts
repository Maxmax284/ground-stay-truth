/**
 * Spoken assistant replies — optional text-to-speech playback.
 *
 * Off by default. When the user turns the speaker on in the assistant header,
 * the panel calls `speak()` with the latest assistant reply; audio is generated
 * on demand by the `speak-reply` backend function and played once, never stored.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SpeechState = "idle" | "loading" | "playing";

export function useSpokenReply(onError?: (message: string) => void) {
  const [state, setState] = useState<SpeechState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);

  const stop = useCallback(() => {
    requestRef.current += 1; // invalidate any in-flight generation
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = "";
      audioRef.current = null;
    }
    setState("idle");
  }, []);

  // Never keep audio playing after the panel unmounts.
  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string, language?: string) => {
      const clean = (text || "").trim();
      if (!clean) return;
      stop();
      const token = (requestRef.current += 1);
      setState("loading");
      try {
        const { data, error } = await supabase.functions.invoke("speak-reply", {
          body: { text: clean, language },
        });
        if (error) throw error;
        const audio = (data as { audio?: string })?.audio;
        if (!audio) throw new Error("No audio returned");
        if (token !== requestRef.current) return; // superseded or stopped

        const mime = (data as { mimeType?: string })?.mimeType || "audio/mpeg";
        const el = new Audio(`data:${mime};base64,${audio}`);
        audioRef.current = el;
        el.onended = () => {
          if (token === requestRef.current) setState("idle");
        };
        el.onerror = () => {
          if (token === requestRef.current) setState("idle");
        };
        await el.play();
        if (token === requestRef.current) setState("playing");
      } catch (e) {
        if (token === requestRef.current) setState("idle");
        onError?.(e instanceof Error ? e.message : "Could not read that reply out loud.");
      }
    },
    [onError, stop],
  );

  return { state, speak, stop };
}
