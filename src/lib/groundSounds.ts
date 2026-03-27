/**
 * Ground Sounds — Minimal zen audio feedback using Web Audio API.
 * No external files needed; all sounds are synthesized programmatically.
 */

type SoundName =
  | "notification"
  | "payment"
  | "booking_confirmed"
  | "check_in"
  | "issue_resolved"
  | "error"
  | "briefing"
  | "landed"
  | "message"
  | "state_change";

interface SoundDef {
  /** Frequencies to play (Hz). Multiple = chord / sequence. */
  freqs: number[];
  /** Duration per note in seconds */
  duration: number;
  /** Type of oscillator wave */
  wave: OscillatorType;
  /** Delay between notes if sequential (s). 0 = chord */
  stagger: number;
  /** Gain (0-1) */
  gain: number;
}

/**
 * Minimal zen sound palette:
 * Soft bells, bamboo taps, nature-inspired tones using sine/triangle waves.
 */
const SOUND_LIBRARY: Record<SoundName, SoundDef> = {
  notification: {
    freqs: [880, 1108.73], // A5 → C#6: gentle two-note chime
    duration: 0.25,
    wave: "sine",
    stagger: 0.12,
    gain: 0.15,
  },
  payment: {
    freqs: [523.25, 659.25, 783.99], // C5 → E5 → G5: ascending major triad
    duration: 0.18,
    wave: "sine",
    stagger: 0.09,
    gain: 0.14,
  },
  booking_confirmed: {
    freqs: [440, 554.37, 659.25], // A4 → C#5 → E5: warm ascending
    duration: 0.3,
    wave: "sine",
    stagger: 0.15,
    gain: 0.13,
  },
  check_in: {
    freqs: [659.25, 783.99, 987.77, 1174.66], // E5 → G5 → B5 → D6: welcoming arpeggio
    duration: 0.22,
    wave: "sine",
    stagger: 0.1,
    gain: 0.12,
  },
  issue_resolved: {
    freqs: [523.25, 783.99], // C5 → G5: perfect fifth = resolution
    duration: 0.2,
    wave: "triangle",
    stagger: 0.08,
    gain: 0.14,
  },
  error: {
    freqs: [330, 277.18], // E4 → C#4: descending minor = subtle alert
    duration: 0.15,
    wave: "triangle",
    stagger: 0.12,
    gain: 0.12,
  },
  briefing: {
    freqs: [392, 493.88, 587.33], // G4 → B4 → D5: morning wake tone
    duration: 0.35,
    wave: "sine",
    stagger: 0.18,
    gain: 0.1,
  },
  landed: {
    freqs: [659.25, 783.99, 659.25], // E5 → G5 → E5: arrival ping
    duration: 0.15,
    wave: "sine",
    stagger: 0.1,
    gain: 0.13,
  },
  message: {
    freqs: [1046.5], // C6: single gentle ping
    duration: 0.12,
    wave: "sine",
    stagger: 0,
    gain: 0.1,
  },
  state_change: {
    freqs: [523.25, 659.25], // C5 → E5: simple interval
    duration: 0.2,
    wave: "triangle",
    stagger: 0.1,
    gain: 0.11,
  },
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a named sound from the Ground Sounds library.
 * @param name  Which sound to play
 * @param volume  Master volume multiplier (0-1), typically from admin setting
 */
export function playGroundSound(name: SoundName, volume: number = 0.5): void {
  try {
    const def = SOUND_LIBRARY[name];
    if (!def) return;

    const ctx = getAudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = def.gain * volume;
    masterGain.connect(ctx.destination);

    def.freqs.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * def.stagger;

      const osc = ctx.createOscillator();
      osc.type = def.wave;
      osc.frequency.value = freq;

      // Per-note envelope for smooth attack/release (zen feel)
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(1, startTime + 0.02); // 20ms attack
      noteGain.gain.exponentialRampToValueAtTime(0.01, startTime + def.duration); // smooth decay

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + def.duration + 0.05);
    });
  } catch {
    // Silently fail — audio is non-critical UX enhancement
  }
}

export type { SoundName };
export const SOUND_NAMES = Object.keys(SOUND_LIBRARY) as SoundName[];
