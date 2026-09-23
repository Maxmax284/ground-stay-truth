/**
 * Airport guidance directory — Stage 3.
 *
 * What this is: a small, hand-checked directory of the airports our guests
 * actually pass through, with the airport's own official website and map as the
 * source of truth for anything that changes (gates, counters, shops, transfers).
 *
 * What this deliberately is NOT:
 * - No gate numbers, no check-in desk numbers, no walking directions. Those
 *   change daily and we don't maintain them, so we link the airport's own map
 *   instead of guessing.
 * - No visa, entry or transit-permission advice. `entryNote` only ever points at
 *   the official government source for the jurisdiction.
 * - No coverage claim we can't keep. An airport we haven't checked returns
 *   `kind: "unknown"` and the UI says so plainly.
 *
 * Every entry carries `lastReviewed` so a stale card is visible rather than
 * quietly trusted.
 */

export interface AirportLink {
  label: string;
  /** Official airport or government URL only — never a blog or aggregator. */
  url: string;
}

export interface AirportGuidance {
  /** IATA code, uppercase. */
  code: string;
  /** ICAO code where we are sure of it. */
  icao?: string;
  name: string;
  city: string;
  country: string;
  /** IANA timezone, for showing local times without guessing. */
  timezone: string;
  /** One honest orientation line. No promises, no directions. */
  orientation: string;
  /** Terminal structure only where it is stable and we've checked it. */
  terminals?: string;
  links: AirportLink[];
  /** ISO date this entry was last checked by a human. */
  lastReviewed: string;
}

const REVIEWED = "2026-09-23";

/**
 * Curated airports: the two ends of every Lamai journey (BKK, USM) plus the
 * transit and origin airports we have actually seen on bookings. Adding an
 * airport here means a person checked its official links on `lastReviewed`.
 */
export const CURATED_AIRPORTS: Record<string, AirportGuidance> = {
  BKK: {
    code: "BKK",
    icao: "VTBS",
    name: "Suvarnabhumi Airport",
    city: "Bangkok",
    country: "Thailand",
    timezone: "Asia/Bangkok",
    orientation:
      "One large passenger terminal plus a satellite building reached by an automated train. Arrivals and departures are on separate levels, and domestic flights to Koh Samui leave from the same terminal.",
    terminals: "Main passenger terminal + SAT-1 satellite concourse (shuttle train)",
    links: [
      { label: "Official airport website", url: "https://suvarnabhumi.airportthai.co.th/en" },
      { label: "Thailand immigration (official)", url: "https://www.immigration.go.th/en/" },
      { label: "Thailand Digital Arrival Card (official)", url: "https://tdac.immigration.go.th/" },
    ],
    lastReviewed: REVIEWED,
  },
  USM: {
    code: "USM",
    icao: "VTSM",
    name: "Samui International Airport",
    city: "Koh Samui",
    country: "Thailand",
    timezone: "Asia/Bangkok",
    orientation:
      "A small open-air airport. You walk off the aircraft to a shuttle, and arrivals, baggage and the pickup area are only a short walk apart.",
    links: [{ label: "Official airport website", url: "https://samuiairportonline.com/" }],
    lastReviewed: REVIEWED,
  },
  DMK: {
    code: "DMK",
    icao: "VTBD",
    name: "Don Mueang International Airport",
    city: "Bangkok",
    country: "Thailand",
    timezone: "Asia/Bangkok",
    orientation:
      "Bangkok's second airport, separate from Suvarnabhumi (BKK). Changing between the two means a road transfer across the city, not a walk between terminals.",
    links: [{ label: "Official airport website", url: "https://www.donmueangairport.com/" }],
    lastReviewed: REVIEWED,
  },
  SIN: {
    code: "SIN",
    icao: "WSSS",
    name: "Changi Airport",
    city: "Singapore",
    country: "Singapore",
    timezone: "Asia/Singapore",
    orientation:
      "Several terminals linked by walkways and a free train. Check your onward terminal on the airport's own map before you set off.",
    links: [{ label: "Official airport website and maps", url: "https://www.changiairport.com/" }],
    lastReviewed: REVIEWED,
  },
  HKG: {
    code: "HKG",
    icao: "VHHH",
    name: "Hong Kong International Airport",
    city: "Hong Kong",
    country: "Hong Kong SAR",
    timezone: "Asia/Hong_Kong",
    orientation:
      "A large transfer hub. Transit passengers usually stay airside and follow the transfer signage rather than clearing immigration.",
    links: [{ label: "Official airport website and maps", url: "https://www.hongkongairport.com/" }],
    lastReviewed: REVIEWED,
  },
  DOH: {
    code: "DOH",
    icao: "OTHH",
    name: "Hamad International Airport",
    city: "Doha",
    country: "Qatar",
    timezone: "Asia/Qatar",
    orientation:
      "A single large terminal built around transfers, with concourses reached on foot or by an internal train.",
    links: [{ label: "Official airport website and maps", url: "https://dohahamadairport.com/" }],
    lastReviewed: REVIEWED,
  },
  DXB: {
    code: "DXB",
    icao: "OMDB",
    name: "Dubai International Airport",
    city: "Dubai",
    country: "United Arab Emirates",
    timezone: "Asia/Dubai",
    orientation:
      "Three terminals that are not all connected airside. If your onward flight leaves from a different terminal, check the airport's own transfer guidance.",
    links: [{ label: "Official airport website and maps", url: "https://www.dubaiairports.ae/" }],
    lastReviewed: REVIEWED,
  },
  TPE: {
    code: "TPE",
    icao: "RCTP",
    name: "Taiwan Taoyuan International Airport",
    city: "Taoyuan",
    country: "Taiwan",
    timezone: "Asia/Taipei",
    orientation:
      "Two passenger terminals connected by a free shuttle train, with a third under construction. Confirm your onward terminal on the airport's map.",
    links: [{ label: "Official airport website and maps", url: "https://www.taoyuan-airport.com/english" }],
    lastReviewed: REVIEWED,
  },
  ICN: {
    code: "ICN",
    icao: "RKSI",
    name: "Incheon International Airport",
    city: "Seoul",
    country: "South Korea",
    timezone: "Asia/Seoul",
    orientation:
      "Two terminals a shuttle ride apart, plus satellite concourses reached by train. Allow time if your onward flight is in the other terminal.",
    links: [{ label: "Official airport website and maps", url: "https://www.airport.kr/ap/en/index.do" }],
    lastReviewed: REVIEWED,
  },
  KUL: {
    code: "KUL",
    icao: "WMKK",
    name: "Kuala Lumpur International Airport",
    city: "Kuala Lumpur",
    country: "Malaysia",
    timezone: "Asia/Kuala_Lumpur",
    orientation:
      "Two terminals connected by a train. Low-cost carriers generally use Terminal 2, so check which one your onward flight leaves from.",
    links: [{ label: "Official airport website and maps", url: "https://www.malaysiaairports.com.my/" }],
    lastReviewed: REVIEWED,
  },
  NRT: {
    code: "NRT",
    icao: "RJAA",
    name: "Narita International Airport",
    city: "Tokyo",
    country: "Japan",
    timezone: "Asia/Tokyo",
    orientation:
      "Three terminals connected by shuttle bus and walkways. Narita and Haneda (HND) are different airports, well over an hour apart.",
    links: [{ label: "Official airport website and maps", url: "https://www.narita-airport.jp/en/" }],
    lastReviewed: REVIEWED,
  },
  HND: {
    code: "HND",
    icao: "RJTT",
    name: "Haneda Airport",
    city: "Tokyo",
    country: "Japan",
    timezone: "Asia/Tokyo",
    orientation:
      "Closer to central Tokyo than Narita, with separate domestic and international terminals linked by free shuttles and trains.",
    links: [{ label: "Official airport website and maps", url: "https://tokyo-haneda.com/en/" }],
    lastReviewed: REVIEWED,
  },
  CDG: {
    code: "CDG",
    icao: "LFPG",
    name: "Paris Charles de Gaulle Airport",
    city: "Paris",
    country: "France",
    timezone: "Europe/Paris",
    orientation:
      "Several terminals spread over a wide site and connected by a free automated train. Your terminal depends on the airline, so check it before you travel.",
    links: [{ label: "Official airport website and maps", url: "https://www.parisaeroport.fr/en" }],
    lastReviewed: REVIEWED,
  },
  FRA: {
    code: "FRA",
    icao: "EDDF",
    name: "Frankfurt Airport",
    city: "Frankfurt",
    country: "Germany",
    timezone: "Europe/Berlin",
    orientation:
      "Two terminals linked by a free shuttle and train. Transfers can involve a long walk, so give yourself time.",
    links: [{ label: "Official airport website and maps", url: "https://www.frankfurt-airport.com/en.html" }],
    lastReviewed: REVIEWED,
  },
  AMS: {
    code: "AMS",
    icao: "EHAM",
    name: "Amsterdam Airport Schiphol",
    city: "Amsterdam",
    country: "Netherlands",
    timezone: "Europe/Amsterdam",
    orientation:
      "One terminal with several piers under one roof, so transfers are usually walkable.",
    links: [{ label: "Official airport website and maps", url: "https://www.schiphol.nl/en/" }],
    lastReviewed: REVIEWED,
  },
  LHR: {
    code: "LHR",
    icao: "EGLL",
    name: "Heathrow Airport",
    city: "London",
    country: "United Kingdom",
    timezone: "Europe/London",
    orientation:
      "Four passenger terminals connected by free trains and buses. Terminal changes take time, so confirm yours before you arrive.",
    links: [{ label: "Official airport website and maps", url: "https://www.heathrow.com/" }],
    lastReviewed: REVIEWED,
  },
  IAD: {
    code: "IAD",
    icao: "KIAD",
    name: "Washington Dulles International Airport",
    city: "Washington, D.C.",
    country: "United States",
    timezone: "America/New_York",
    orientation:
      "One main terminal plus separate concourses reached by an underground train. Follow the airport's own signage for your concourse.",
    links: [{ label: "Official airport website and maps", url: "https://www.flydulles.com/" }],
    lastReviewed: REVIEWED,
  },
  SYD: {
    code: "SYD",
    icao: "YSSY",
    name: "Sydney Airport",
    city: "Sydney",
    country: "Australia",
    timezone: "Australia/Sydney",
    orientation:
      "International and domestic terminals are separate and connected by train or shuttle bus — allow time between them.",
    links: [{ label: "Official airport website and maps", url: "https://www.sydneyairport.com.au/" }],
    lastReviewed: REVIEWED,
  },
};

export type AirportGuidanceResult =
  | { kind: "curated"; airport: AirportGuidance }
  | { kind: "unknown"; code: string };

/** Normalises whatever the itinerary gave us into a plain IATA code. */
export function normalizeAirportCode(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Looks up guidance for one leg's airport. Never invents an entry: an airport we
 * haven't checked comes back as `unknown` so the UI can say "we don't have
 * checked guidance for this airport" instead of making something up.
 */
export function resolveAirportGuidance(raw?: string | null): AirportGuidanceResult | null {
  const code = normalizeAirportCode(raw);
  if (!code) return null;
  const airport = CURATED_AIRPORTS[code];
  return airport ? { kind: "curated", airport } : { kind: "unknown", code };
}

/** True when the entry hasn't been checked within `days`. Drives a staleness hint. */
export function isGuidanceStale(
  airport: AirportGuidance,
  now: Date = new Date(),
  days = 180,
): boolean {
  const reviewed = new Date(`${airport.lastReviewed}T00:00:00Z`);
  if (Number.isNaN(reviewed.getTime())) return true;
  return now.getTime() - reviewed.getTime() > days * 86_400_000;
}

/** Codes we have checked — used by tests and by the admin coverage view. */
export function curatedAirportCodes(): string[] {
  return Object.keys(CURATED_AIRPORTS).sort();
}
