// -----------------------------------------------------------------------------
// speak-reply — text to speech for assistant replies (Kru Glitch + Deep ops).
//
// Signed-in users only. The client sends the assistant reply text plus an
// optional language hint; this function asks the Lovable AI gateway for a
// complete MP3 and returns it base64-encoded so the browser can play it with a
// data URI. Nothing is stored — audio is generated per request and discarded.
//
// Spoken replies are OPTIONAL: the client only calls this when the user turns
// the speaker on, so no request happens by default.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse, getCorsHeaders } from "../_shared/cors.ts";

const MODEL = "openai/gpt-4o-mini-tts";
const VOICE = "alloy";
// Keep one request comfortably inside the model's input limit. Longer replies
// are trimmed at a sentence boundary rather than truncated mid-word.
const MAX_CHARS = 1800;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  th: "Thai",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

/** Strip markdown so the voice doesn't read asterisks, pipes and backticks. */
function toSpeakable(raw: string): string {
  let text = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (text.length > MAX_CHARS) {
    const slice = text.slice(0, MAX_CHARS);
    const cut = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("\n"), slice.lastIndexOf("!"));
    text = (cut > MAX_CHARS * 0.5 ? slice.slice(0, cut + 1) : slice).trim();
  }
  return text;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Sign in required" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse(req, { error: "Sign in required" }, 401);
    }

    const body = await req.json().catch(() => null);
    const raw = typeof body?.text === "string" ? body.text : "";
    const text = toSpeakable(raw);
    if (!text) return jsonResponse(req, { error: "Nothing to read out" }, 400);

    const lang = typeof body?.language === "string" ? body.language.slice(0, 2).toLowerCase() : "en";
    const languageName = LANGUAGE_NAMES[lang] ?? "English";

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return jsonResponse(req, { error: "Spoken replies are not configured" }, 503);

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice: VOICE,
        response_format: "mp3",
        instructions: `Speak in ${languageName}. Calm, clear, matter-of-fact operations briefing tone. No filler.`,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`speech failed [${upstream.status}]: ${detail}`);
      const message =
        upstream.status === 429
          ? "Spoken replies are busy right now. Try again in a moment."
          : upstream.status === 402
            ? "AI credits are exhausted. Top up to keep using spoken replies."
            : "Could not read that reply out loud.";
      return jsonResponse(req, { error: message, status: upstream.status, details: detail }, upstream.status);
    }

    const audio = bytesToBase64(new Uint8Array(await upstream.arrayBuffer()));
    return new Response(JSON.stringify({ audio, mimeType: "audio/mpeg" }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("speak-reply error", e);
    return jsonResponse(req, { error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
