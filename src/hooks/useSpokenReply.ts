/**
 * Spoken assistant replies — optional text-to-speech playback.
 *
 * Off by default. When the user turns the speaker on in the assistant header,
 * the panel calls `speak()` with the latest assistant reply.
 *
 * Latency notes (why this is chunked):
 * TTS models return a *complete* audio file — nothing plays until the whole
 * reply is synthesized. A 1500-character answer therefore stalls for seconds.
 * So we split the reply at sentence boundaries, synthesize a short first
 * segment (fast round trip), start playing it, and prefetch the remaining
 * segments while it plays. We also request raw MP3 bytes instead of
 * base64-in-JSON and play from a blob URL, which removes the extra ~33%
 * payload and the data-URI decode step.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SpeechState = "idle" | "loading" | "playing";

/** First segment stays small so audio starts almost immediately. */
const FIRST_SEGMENT_CHARS = 220;
const NEXT_SEGMENT_CHARS = 600;
const MAX_SEGMENTS = 6;

/** Split text on sentence boundaries into progressively larger segments. */
export function segmentForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*/g) ?? [clean];
  const segments: string[] = [];
  let buf = "";
  const limit = () => (segments.length === 0 ? FIRST_SEGMENT_CHARS : NEXT_SEGMENT_CHARS);

  for (const sentence of sentences) {
    if (buf && (buf + sentence).length > limit()) {
      segments.push(buf.trim());
      buf = "";
    }
    buf += sentence;
    // A single very long sentence still has to be cut somewhere.
    while (buf.length > limit() * 2) {
      segments.push(buf.slice(0, limit()).trim());
      buf = buf.slice(limit());
    }
  }
  if (buf.trim()) segments.push(buf.trim());
  return segments.slice(0, MAX_SEGMENTS);
}

async function fetchSegment(text: string, language?: string): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speak-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text, language, raw: true }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || "Could not read that reply out loud.");
  }
  return URL.createObjectURL(await res.blob());
}

export function useSpokenReply(onError?: (message: string) => void) {
  const [state, setState] = useState<SpeechState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef<string[]>([]);
  const requestRef = useRef(0);

  const stop = useCallback(() => {
    requestRef.current += 1; // invalidate any in-flight generation
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = "";
      audioRef.current = null;
    }
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setState("idle");
  }, []);

  // Never keep audio playing after the panel unmounts.
  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string, language?: string) => {
      const segments = segmentForSpeech(text || "");
      if (segments.length === 0) return;
      stop();
      const token = (requestRef.current += 1);
      const alive = () => token === requestRef.current;
      setState("loading");

      const playUrl = (url: string) =>
        new Promise<void>((resolve, reject) => {
          if (!alive()) return resolve();
          const el = new Audio(url);
          audioRef.current = el;
          el.onended = () => resolve();
          el.onerror = () => reject(new Error("Playback failed"));
          el.play().then(
            () => {
              if (alive()) setState("playing");
            },
            reject,
          );
        });

      try {
        // Kick off the first segment; prefetch the next while the first plays.
        let pending = fetchSegment(segments[0], language);
        for (let i = 0; i < segments.length; i++) {
          const url = await pending;
          if (!alive()) return;
          urlsRef.current.push(url);
          pending =
            i + 1 < segments.length
              ? fetchSegment(segments[i + 1], language)
              : Promise.resolve("");
          await playUrl(url);
          if (!alive()) return;
          URL.revokeObjectURL(url);
          urlsRef.current = urlsRef.current.filter((u) => u !== url);
        }
        if (alive()) setState("idle");
      } catch (e) {
        if (alive()) {
          setState("idle");
          onError?.(e instanceof Error ? e.message : "Could not read that reply out loud.");
        }
      }
    },
    [onError, stop],
  );

  return { state, speak, stop };
}
