/**
 * Airports we receive guests from. Used by the staff flight board and any
 * airport-aware UI so we are not hardcoded to Samui + Bangkok.
 */
export interface TrackedAirport {
  /** IATA code as stored in airport_traffic.airport_iata */
  iata: string;
  /** Short label for chips/selectors */
  label: string;
  icon: string;
  /** Arrival-location id used by the arrival guide fact sheets, if any */
  locationId?: string;
}

export const TRACKED_AIRPORTS: TrackedAirport[] = [
  { iata: "USM", label: "Samui", icon: "🌴", locationId: "samui" },
  { iata: "BKK", label: "Bangkok Suvarnabhumi", icon: "🏙", locationId: "bkk" },
  { iata: "DMK", label: "Bangkok Don Mueang", icon: "🛫", locationId: "dmk" },
  { iata: "URT", label: "Surat Thani", icon: "⛴️", locationId: "urt" },
  { iata: "HKT", label: "Phuket", icon: "🏝" },
  { iata: "CNX", label: "Chiang Mai", icon: "⛰" },
  { iata: "KBV", label: "Krabi", icon: "🪨" },
  { iata: "SIN", label: "Singapore", icon: "🇸🇬" },
  { iata: "KUL", label: "Kuala Lumpur", icon: "🇲🇾" },
];

export const TRACKED_AIRPORT_CODES = TRACKED_AIRPORTS.map((a) => a.iata);

export function getAirportLabel(iata?: string | null): string {
  if (!iata) return "—";
  const code = iata.toUpperCase();
  const match = TRACKED_AIRPORTS.find((a) => a.iata === code);
  return match ? `${match.label} (${code})` : code;
}

export function getAirportIcon(iata?: string | null): string {
  if (!iata) return "✈️";
  const match = TRACKED_AIRPORTS.find((a) => a.iata === iata.toUpperCase());
  return match?.icon ?? "✈️";
}
