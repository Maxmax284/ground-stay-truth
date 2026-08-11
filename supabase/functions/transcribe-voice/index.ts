// -----------------------------------------------------------------------------
// transcribe-voice — speech to text for the in-app assistant (Kru Glitch + Deep ops).
//
// Signed-in users only. The client records mono 16 kHz PCM and encodes a
// complete WAV file, sends it base64 in JSON, and this function forwards it to
// the Lovable AI gateway transcription endpoint. Thai and English both work via
// auto-detection; an explicit `language` hint (ISO-639-1) is passed through.
//
// No audio is stored anywhere — it is transcribed in-flight and discarded.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse, getCorsHeaders } from "../_shared/cors.ts";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MiB of WAV ~ a few minutes at 16 kHz mono
const MIN_BYTES = 2048; // header-only / silent clips
const MODEL = "openai/gpt-4o-mini-transcribe";
const ALLOWED_LANGS = new Set(["en", "th", "fr", "de", "es", "it", "ru", "zh", "ja", "ko"]);

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    // --- Auth: any signed-in user (staff or guest) may dictate ---------------
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
    const audioB64 = typeof body?.audio === "string" ? body.audio : "";
    if (!audioB64) return jsonResponse(req, { error: "No audio received" }, 400);

    const bytes = base64ToBytes(audioB64);
    if (bytes.byteLength < MIN_BYTES) {
      return jsonResponse(req, { error: "That recording was empty — please try again." }, 400);
    }
    if (bytes.byteLength > MAX_BYTES) {
      return jsonResponse(req, { error: "Recording too long. Keep it under a couple of minutes." }, 413);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return jsonResponse(req, { error: "Voice input is not configured" }, 503);

    const form = new FormData();
    form.append("model", MODEL);
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "recording.wav");
    const lang = typeof body?.language === "string" ? body.language.slice(0, 2).toLowerCase() : "";
    if (lang && ALLOWED_LANGS.has(lang)) form.append("language", lang);

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`transcription failed [${upstream.status}]: ${detail}`);
      const message =
        upstream.status === 429
          ? "Voice input is busy right now. Try again in a moment."
          : upstream.status === 402
            ? "AI credits are exhausted. Top up to keep using voice input."
            : "Could not transcribe that recording.";
      return jsonResponse(req, { error: message, status: upstream.status, details: detail }, upstream.status);
    }

    const result = await upstream.json();
    const text = typeof result?.text === "string" ? result.text.trim() : "";
    return new Response(JSON.stringify({ text }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-voice error", e);
    return jsonResponse(req, { error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
