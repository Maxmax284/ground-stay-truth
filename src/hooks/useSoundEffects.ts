import { useCallback, useMemo } from "react";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { playGroundSound, type SoundName } from "@/lib/groundSounds";

/**
 * Hook that reads admin Ground Sounds settings and exposes a `play` function.
 * When sounds are disabled globally, `play` is a no-op.
 */
export function useSoundEffects() {
  const { data: settings } = usePolicySettings();

  const { enabled, volume } = useMemo(() => {
    const byKey = new Map(settings?.map((s) => [s.key, s.value]) ?? []);
    const isEnabled = String(byKey.get("sound_effects_enabled") ?? "false") === "true";
    const vol = Math.min(1, Math.max(0, Number(byKey.get("sound_effects_volume") ?? "50") / 100));
    return { enabled: isEnabled, volume: vol };
  }, [settings]);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled) return;
      playGroundSound(name, volume);
    },
    [enabled, volume]
  );

  return { play, enabled, volume };
}
