/**
 * VoiceInputButton — press to talk, release/tap again to transcribe.
 *
 * Used by the assistant composer (Kru Glitch and Deep ops). Thai and English
 * both work; the current UI language is sent as a hint.
 */
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface VoiceInputButtonProps {
  language?: string;
  disabled?: boolean;
  onTranscript: (text: string) => void;
}

export function VoiceInputButton({ language, disabled, onTranscript }: VoiceInputButtonProps) {
  const { state, supported, start, stopAndTranscribe } = useVoiceInput({
    language,
    onTranscript,
    onError: (m) => toast.error(m),
  });

  if (!supported) return null;

  const recording = state === "recording";
  const busy = state === "transcribing";

  return (
    <Button
      type="button"
      size="icon"
      variant={recording ? "destructive" : "outline"}
      disabled={disabled || busy}
      aria-label={recording ? "Stop recording and transcribe" : "Dictate with microphone"}
      aria-pressed={recording}
      className="shrink-0 self-end"
      onClick={() => (recording ? void stopAndTranscribe() : void start())}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : recording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}

export default VoiceInputButton;
