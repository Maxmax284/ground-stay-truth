/**
 * Property-contextual guest type definitions.
 * Guest types describe the nature of a guest's stay at a specific property —
 * they are NOT identity labels and have no connection to training or cross-property activity.
 * 
 * Training association is handled exclusively via booking_training_links.
 */

export interface GuestTypeOption {
  value: string;
  labelKey: string;
}

/** Guest types for high-turnover / gym properties like Lamai Muay Thai */
const HIGH_TURNOVER_TYPES: GuestTypeOption[] = [
  { value: "fighter", labelKey: "guestBooking.guestTypes.fighter" },
  { value: "training_guest", labelKey: "guestBooking.guestTypes.training_guest" },
  { value: "spectator", labelKey: "guestBooking.guestTypes.spectator" },
  { value: "long_term", labelKey: "guestBooking.guestTypes.long_term" },
];

/** Guest types for long-stay / general guesthouse properties like Koh Shanti */
const LONG_STAY_TYPES: GuestTypeOption[] = [
  { value: "traveler", labelKey: "guestBooking.guestTypes.traveler" },
  { value: "digital_nomad", labelKey: "guestBooking.guestTypes.digital_nomad" },
  { value: "couple", labelKey: "guestBooking.guestTypes.couple" },
  { value: "long_term", labelKey: "guestBooking.guestTypes.long_term" },
  { value: "business", labelKey: "guestBooking.guestTypes.business" },
];

/** Default guest type per operational mode */
export const DEFAULT_GUEST_TYPE: Record<string, string> = {
  high_turnover: "training_guest",
  long_stay: "traveler",
};

/**
 * Returns the appropriate guest type options for a given operational mode.
 */
export function getGuestTypesForMode(operationalMode: string | null): GuestTypeOption[] {
  if (operationalMode === "long_stay") return LONG_STAY_TYPES;
  return HIGH_TURNOVER_TYPES;
}
