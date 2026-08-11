/**
 * Voice input for the assistant — mic capture -> WAV -> transcription.
 *
 * We capture raw PCM with the Web Audio API and encode a complete 16 kHz mono
 * WAV before uploading. MediaRecorder chunks are avoided on purpose: only the
 * first chunk carries a container header, and iOS Safari records fragmented MP4
 * that the transcription models reject.
 *
 * Works for Thai and English (and the other supported UI languages) — the
 * current UI language is passed as a hint, detection handles the rest.
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TARGET_RATE = 16000;

function downsample(chunks: Float32Array[], inputRate: number): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  if (inputRate <= TARGET_RATE) return merged;
  const ratio = inputRate / TARGET_RATE;
  const outLength = Math.floor(merged.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export type VoiceState = "idle" | "recording" | "transcribing";

interface UseVoiceInputOptions {
  /** ISO-639-1 hint, e.g. "en" or "th". Detection still applies. */
  language?: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

export function useVoiceInput({ language, onTranscript, onError }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

  const teardown = useCallback(() => {
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      onError?.("Voice input isn't available on this device or browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      node.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(node);
      node.connect(ctx.destination);
      sourceRef.current = source;
      nodeRef.current = node;
      setState("recording");
    } catch {
      teardown();
      setState("idle");
      onError?.("Microphone access is needed to dictate. Allow it in your browser settings.");
    }
  }, [onError, supported, teardown]);

  const cancel = useCallback(async () => {
    teardown();
    chunksRef.current = [];
    await ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setState("idle");
  }, [teardown]);

  const stopAndTranscribe = useCallback(async () => {
    const ctx = ctxRef.current;
    const rate = ctx?.sampleRate ?? TARGET_RATE;
    teardown();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    await ctx?.close().catch(() => undefined);
    ctxRef.current = null;

    const samples = downsample(chunks, rate);
    const wav = encodeWav(samples, Math.min(rate, TARGET_RATE));
    if (wav.size < 2048) {
      setState("idle");
      onError?.("That recording was empty — hold the button and speak, then release.");
      return;
    }

    setState("transcribing");
    try {
      const audio = await blobToBase64(wav);
      const { data, error } = await supabase.functions.invoke("transcribe-voice", {
        body: { audio, language },
      });
      if (error) throw error;
      const text = typeof (data as { text?: string })?.text === "string" ? (data as { text: string }).text : "";
      if (!text.trim()) {
        onError?.("Didn't catch that. Try again a bit closer to the mic.");
      } else {
        onTranscript(text.trim());
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not transcribe that recording.");
    } finally {
      setState("idle");
    }
  }, [language, onError, onTranscript, teardown]);

  return { state, supported, start, stopAndTranscribe, cancel };
}
