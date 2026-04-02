/**
 * Hardcoded airport fact sheets for BKK and USM.
 * These provide real, verified data that feeds into AI content generation
 * and appears as reference cards in the section editor.
 */

export interface TransportOption {
  name: string;
  cost: string;
  duration: string;
  notes: string;
}

export interface AirportFacts {
  code: string;
  name: string;
  fullName: string;
  type: string;
  immigration: {
    estimatedTime: string;
    tips: string[];
    formRequired: string;
    eVisaAvailable: boolean;
  };
  customs: {
    greenChannel: boolean;
    declarationForm: boolean;
    tips: string[];
  };
  simCards: {
    providers: string[];
    locations: string;
    costRange: string;
    tips: string[];
  };
  cash: {
    atmLocations: string;
    exchangeLocations: string;
    tips: string[];
    recommendedAmount: string;
  };
  transport: {
    toCamp: TransportOption[];
    withinAirport: string[];
    tips: string[];
  };
  terminal: {
    layout: string;
    floors: string;
    meetingPoints: string[];
    food: string;
    tips: string[];
  };
  routeToCamp: {
    estimatedTime: string;
    landmarks: string[];
    description: string;
  };
  weather: {
    rainySeasonMonths: string;
    hotSeasonMonths: string;
    tips: string[];
  };
  connectivity: {
    airportWifi: string;
    tips: string[];
  };
  lateNight: {
    lastFlightApprox: string;
    safetyTips: string[];
    transportAvailability: string;
  };
}

export const AIRPORT_FACTS: Record<string, AirportFacts> = {
  bkk: {
    code: "BKK",
    name: "Suvarnabhumi",
    fullName: "Suvarnabhumi Airport (BKK)",
    type: "Large international airport",
    immigration: {
      estimatedTime: "20–60 minutes depending on time of day",
      tips: [
        "Have your passport, boarding pass, and arrival card ready",
        "Use the e-gates if your nationality is eligible (US, EU, etc.)",
        "Visa on Arrival queue is separate — follow 'VOA' signs if needed",
        "Peak hours: 00:00–03:00 when many long-haul flights land simultaneously",
      ],
      formRequired: "TM.6 arrival/departure card (sometimes provided on the plane)",
      eVisaAvailable: true,
    },
    customs: {
      greenChannel: true,
      declarationForm: false,
      tips: [
        "Walk through the green 'Nothing to Declare' channel unless carrying restricted items",
        "Alcohol limit: 1 litre. Cigarettes: 200 sticks",
        "E-cigarettes/vapes are illegal in Thailand — leave them at home",
      ],
    },
    simCards: {
      providers: ["AIS", "TrueMove H", "DTAC"],
      locations: "Arrivals hall, Level 2 — counters immediately after exiting customs",
      costRange: "฿299–฿599 for tourist SIM (7–30 days, unlimited data)",
      tips: [
        "AIS and TrueMove H have the best coverage on Koh Samui",
        "Bring your passport — required for SIM registration",
        "Tourist SIMs include data + some call minutes",
        "You can also buy at any 7-Eleven but airport counters set it up for you",
      ],
    },
    cash: {
      atmLocations: "Multiple ATMs on arrivals level (Level 2) and basement (Level B)",
      exchangeLocations: "SuperRich and bank counters on Level 2. Better rates at basement level exchanges.",
      tips: [
        "Thai ATMs charge ฿220 per withdrawal for foreign cards",
        "Withdraw larger amounts to minimize ATM fees",
        "SuperRich (orange sign) consistently offers the best exchange rates",
        "Most places on Samui accept cash only — have baht ready",
      ],
      recommendedAmount: "฿5,000–10,000 for first few days (taxis, food, supplies)",
    },
    transport: {
      toCamp: [
        {
          name: "Domestic flight BKK → USM",
          cost: "฿2,000–5,000 one-way",
          duration: "~1 hour flight + transfers",
          notes: "Bangkok Airways operates most flights. Book in advance. Terminal transfer may be needed.",
        },
        {
          name: "Taxi + ferry via Surat Thani",
          cost: "฿1,500–2,500 total",
          duration: "10–12 hours",
          notes: "Budget option. Bus from Southern Bus Terminal to Surat Thani, then ferry. Not recommended for first-timers.",
        },
        {
          name: "Lomprayah bus+ferry combo",
          cost: "฿1,100–1,400",
          duration: "~11 hours",
          notes: "Direct service from BKK to Koh Samui with bus and high-speed catamaran. Departs from Khao San Road area.",
        },
      ],
      withinAirport: [
        "Airport Rail Link to central Bangkok (฿45, 30 min to Makkasan)",
        "Metered taxi from Level 1 (meter + ฿50 airport surcharge + tolls ~฿75)",
        "Grab/Bolt ride-hailing from Level 1 or 2",
      ],
      tips: [
        "If flying to Samui same day, check if you need to change terminals",
        "Bangkok Airways domestic flights depart from BKK itself",
        "Always use the official taxi queue on Level 1 — ignore touts inside the terminal",
      ],
    },
    terminal: {
      layout: "Single terminal, multiple concourses. Arrivals on Level 2, Departures on Level 4.",
      floors: "Level B (train), Level 1 (taxis/buses), Level 2 (arrivals), Level 3 (shops), Level 4 (departures)",
      meetingPoints: ["Meeting Point A/B on Level 2 (arrivals)", "Information counter near Gate 3 exit"],
      food: "7-Eleven on Level 2 (arrivals). Food courts on Level 3 and basement. 24-hour restaurants available.",
      tips: [
        "The airport is enormous — allow 15–20 min to walk between gates",
        "Free airport WiFi: 'Suvarnabhumi Airport Free WiFi' (2-hour sessions)",
        "Luggage carts are free in arrivals",
      ],
    },
    routeToCamp: {
      estimatedTime: "Not direct — requires connecting flight or bus+ferry to Koh Samui, then 20–30 min to camp",
      landmarks: ["Nathon Pier (if arriving by ferry)", "Chaweng area", "Lamai Beach road"],
      description: "BKK is not on Koh Samui — guests need a connecting flight (1hr) or bus+ferry combo (10-12hrs) to reach the island. From Samui airport or ferry pier, the camp is a 20–30 minute drive south along the coast to Lamai.",
    },
    weather: {
      rainySeasonMonths: "October – December (heaviest Nov–Dec)",
      hotSeasonMonths: "February – June",
      tips: [
        "Rainy season means short heavy bursts, not all-day rain",
        "Pack a light rain jacket — useful for motorbike rides",
        "Humidity is high year-round (70–90%)",
      ],
    },
    connectivity: {
      airportWifi: "'Suvarnabhumi Airport Free WiFi' — 2-hour free sessions, re-register to extend",
      tips: [
        "WiFi speed is moderate — good enough for messaging, not for large downloads",
        "Get a SIM card for reliable data outside the airport",
      ],
    },
    lateNight: {
      lastFlightApprox: "Arrivals continue until ~02:00",
      safetyTips: [
        "The airport is safe 24/7 with security and CCTV",
        "Use only the official taxi queue — never accept rides from touts inside",
        "Grab/Bolt works 24 hours but surge pricing applies late night",
      ],
      transportAvailability: "Metered taxis and Grab available 24/7. Airport Rail Link runs 06:00–midnight.",
    },
  },

  samui: {
    code: "USM",
    name: "Samui",
    fullName: "Koh Samui Airport (USM)",
    type: "Small open-air boutique airport",
    immigration: {
      estimatedTime: "5–15 minutes (small airport, quick processing)",
      tips: [
        "Immigration is fast here — usually just a few flights at a time",
        "Same documents as BKK: passport + arrival card",
        "If arriving from BKK domestic, no immigration (already cleared at BKK)",
      ],
      formRequired: "TM.6 card (if international arrival)",
      eVisaAvailable: true,
    },
    customs: {
      greenChannel: true,
      declarationForm: false,
      tips: [
        "Very relaxed customs at USM — walk through after collecting bags",
        "Same restrictions apply: no vapes, alcohol/cigarette limits",
      ],
    },
    simCards: {
      providers: ["AIS", "TrueMove H"],
      locations: "Small counter just outside arrivals. Also available at 7-Eleven in Chaweng/Lamai.",
      costRange: "฿299–฿499 tourist SIM",
      tips: [
        "Limited stock at airport — if sold out, any 7-Eleven on the island sells SIMs",
        "AIS has the best coverage across the island including hill areas",
        "Signal can be spotty in mountainous interior — stick to coastal areas for best coverage",
      ],
    },
    cash: {
      atmLocations: "2–3 ATMs in the arrivals area",
      exchangeLocations: "Small exchange counter at arrivals. Better rates at banks in Chaweng or Lamai town.",
      tips: [
        "Same ฿220 ATM fee for foreign cards",
        "Many places on the island are cash-only — especially street food, small shops, and songthaews",
        "Get cash at the airport if arriving late — town ATMs are less convenient at night",
      ],
      recommendedAmount: "฿3,000–5,000 for first few days",
    },
    transport: {
      toCamp: [
        {
          name: "Ground Stay pickup (arranged)",
          cost: "Included or arranged via booking",
          duration: "20–30 minutes",
          notes: "Our driver meets you at arrivals with a name sign. Most reliable option.",
        },
        {
          name: "Taxi from airport",
          cost: "฿500–700",
          duration: "20–30 minutes",
          notes: "Fixed price (no meters on Samui). Negotiate before getting in. Airport taxis are more expensive.",
        },
        {
          name: "Songthaew (shared taxi/truck)",
          cost: "฿100–200 per person",
          duration: "30–50 minutes (shared route, multiple stops)",
          notes: "The red/yellow pickup trucks. Cheap but slow — they follow a loop route and drop passengers along the way.",
        },
        {
          name: "Grab/Bolt",
          cost: "฿300–500",
          duration: "20–30 minutes",
          notes: "Available but fewer drivers than Bangkok. Wait times can be 10–20 min. Works best during daytime.",
        },
      ],
      withinAirport: [
        "The airport is tiny — everything is within 5 min walk",
        "Open-air design — no air-conditioned terminals, just covered walkways with fans",
        "Garden paths between buildings — charming but warm!",
      ],
      tips: [
        "If our pickup is arranged, look for the driver with your name sign at the exit",
        "Don't accept offers from aggressive taxi touts inside — walk to the official area",
        "Grab works but drivers may be 10–15 min away",
      ],
    },
    terminal: {
      layout: "Open-air boutique terminal with garden walkways. Single small building.",
      floors: "Single level. Arrivals exit directly to pickup area.",
      meetingPoints: ["Main exit — small covered area where drivers wait with signs"],
      food: "Small café inside departures. Limited food options at arrivals — eat in Lamai or Chaweng instead.",
      tips: [
        "No jet bridges — you walk across the tarmac to/from the plane",
        "Bring sunglasses — the walk from plane to terminal is in full sun",
        "The whole airport experience takes 15–20 min from landing to pickup",
        "Unique airport — built by Bangkok Airways, feels like a resort",
      ],
    },
    routeToCamp: {
      estimatedTime: "20–30 minutes by car",
      landmarks: [
        "Exit airport → turn right onto Route 4169",
        "Pass through Chaweng Beach area",
        "Continue south along the coast road",
        "Pass Chaweng Noi beach",
        "Enter Lamai area — camp is on the left side near Lamai Beach",
      ],
      description: "Straightforward coastal drive south from the airport. One main road hugs the east coast. You'll pass the busy Chaweng strip, then things get quieter as you approach Lamai. The camp is just off the main road near Lamai Beach.",
    },
    weather: {
      rainySeasonMonths: "October – December (heaviest Nov–Dec, unique to Gulf coast)",
      hotSeasonMonths: "February – June",
      tips: [
        "Samui has its own microclimate — rainy season differs from mainland Thailand",
        "Even in rainy season, mornings are often sunny — rain typically comes in afternoon",
        "Flash floods can occur on the main road during heavy rain — be cautious on motorbikes",
      ],
    },
    connectivity: {
      airportWifi: "Free WiFi available but slow. Get a SIM or wait for camp WiFi.",
      tips: [
        "Camp has WiFi — coverage is good in common areas",
        "Mobile data on AIS/True gives reliable coverage in Lamai area",
      ],
    },
    lateNight: {
      lastFlightApprox: "Last flights arrive ~21:00–22:00",
      safetyTips: [
        "The airport closes after last flight — don't plan to sleep there",
        "Lamai is quiet after 23:00 — this is a small beach town, very safe",
        "Let us know your flight time — we arrange pickups for all arrival times",
      ],
      transportAvailability: "Pre-arranged pickup is best for late arrivals. Grab is unreliable after 21:00. No songthaews at night.",
    },
  },
};

/** Section template types with their guided fields */
export type SectionTypeId =
  | "immigration"
  | "sim_cash"
  | "transport"
  | "terminal_navigation"
  | "route_to_camp"
  | "arrival_first_hour"
  | "local_essentials"
  | "first_24_hours"
  | "rainy_season"
  | "late_night"
  | "bkk_connection"
  | "first_time_thailand"
  | "custom";

export interface GuidedField {
  key: string;
  label: string;
  type: "text" | "textarea" | "list" | "transport_options";
  /** Dot-path into AirportFacts to auto-fill, e.g. "immigration.estimatedTime" */
  factPath?: string;
  placeholder?: string;
  helpText?: string;
}

export interface SectionTemplate {
  id: SectionTypeId;
  title: string;
  description: string;
  category: "journey" | "situational" | "custom";
  icon: string;
  defaultTitle: string;
  guidedFields: GuidedField[];
  /** Which airports this section is relevant for */
  airports: ("bkk" | "samui")[];
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  // ── Journey sections (sequential flow) ──
  {
    id: "immigration",
    title: "Immigration & Customs",
    description: "Guide guests through passport control and customs after landing",
    category: "journey",
    icon: "🛂",
    defaultTitle: "Immigration & Customs",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "estimatedTime", label: "Estimated wait time", type: "text", factPath: "immigration.estimatedTime" },
      { key: "documentsNeeded", label: "Documents needed", type: "text", factPath: "immigration.formRequired" },
      { key: "tips", label: "Key tips for guests", type: "list", factPath: "immigration.tips" },
      { key: "customsTips", label: "Customs tips", type: "list", factPath: "customs.tips" },
      { key: "additionalNotes", label: "Additional notes", type: "textarea", placeholder: "Any extra info for guests..." },
    ],
  },
  {
    id: "sim_cash",
    title: "SIM Cards & Cash",
    description: "Where to get a local SIM card and Thai baht",
    category: "journey",
    icon: "💳",
    defaultTitle: "SIM Card & Cash",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "simProviders", label: "Recommended SIM providers", type: "list", factPath: "simCards.providers" },
      { key: "simLocation", label: "Where to buy SIM", type: "text", factPath: "simCards.locations" },
      { key: "simCost", label: "SIM card cost range", type: "text", factPath: "simCards.costRange" },
      { key: "simTips", label: "SIM tips", type: "list", factPath: "simCards.tips" },
      { key: "atmLocations", label: "ATM locations", type: "text", factPath: "cash.atmLocations" },
      { key: "exchangeInfo", label: "Exchange info", type: "text", factPath: "cash.exchangeLocations" },
      { key: "recommendedCash", label: "Recommended cash amount", type: "text", factPath: "cash.recommendedAmount" },
      { key: "cashTips", label: "Cash tips", type: "list", factPath: "cash.tips" },
    ],
  },
  {
    id: "terminal_navigation",
    title: "Terminal Navigation",
    description: "Help guests find their way around the airport terminal",
    category: "journey",
    icon: "🗺️",
    defaultTitle: "Navigating the Terminal",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "layout", label: "Terminal layout", type: "textarea", factPath: "terminal.layout" },
      { key: "floors", label: "Floor guide", type: "text", factPath: "terminal.floors" },
      { key: "meetingPoints", label: "Meeting/pickup points", type: "list", factPath: "terminal.meetingPoints" },
      { key: "food", label: "Food & drink options", type: "text", factPath: "terminal.food" },
      { key: "tips", label: "Terminal tips", type: "list", factPath: "terminal.tips" },
    ],
  },
  {
    id: "transport",
    title: "Transport to Accommodation",
    description: "All transport options from the airport to your accommodation",
    category: "journey",
    icon: "🚗",
    defaultTitle: "Getting There",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "transportOptions", label: "Transport options", type: "transport_options", factPath: "transport.toCamp" },
      { key: "transportTips", label: "Transport tips", type: "list", factPath: "transport.tips" },
      { key: "additionalNotes", label: "Additional notes", type: "textarea", placeholder: "E.g. pickup arrangement details..." },
    ],
  },
  {
    id: "route_to_camp",
    title: "Route & Landmarks",
    description: "What to expect on the journey from airport to your accommodation",
    category: "journey",
    icon: "📍",
    defaultTitle: "On the Way",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "estimatedTime", label: "Estimated travel time", type: "text", factPath: "routeToCamp.estimatedTime" },
      { key: "routeDescription", label: "Route description", type: "textarea", factPath: "routeToCamp.description" },
      { key: "landmarks", label: "Landmarks along the way", type: "list", factPath: "routeToCamp.landmarks" },
      { key: "additionalNotes", label: "Additional notes", type: "textarea", placeholder: "E.g. scenic spots, what to look for..." },
    ],
  },
  {
    id: "arrival_first_hour",
    title: "Arrival & First Hour",
    description: "What happens when the guest arrives at the accommodation",
    category: "journey",
    icon: "🏠",
    defaultTitle: "Your First Hour",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "checkinProcess", label: "Check-in process", type: "textarea", placeholder: "Describe what happens when they arrive..." },
      { key: "essentials", label: "Essential first things to do", type: "list", placeholder: "E.g. settle in, tour the facilities, meet the team..." },
      { key: "facilities", label: "Key facilities to point out", type: "list", placeholder: "E.g. gym, dining area, pool, WiFi..." },
      { key: "schedule", label: "First day schedule note", type: "textarea", placeholder: "E.g. evening session, dinner time..." },
    ],
  },

  // ── Situational sections ──
  {
    id: "rainy_season",
    title: "Rainy Season Tips",
    description: "Extra guidance for guests arriving during monsoon season (Oct–Dec)",
    category: "situational",
    icon: "🌧️",
    defaultTitle: "Rainy Season Tips",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "months", label: "Rainy season months", type: "text", factPath: "weather.rainySeasonMonths" },
      { key: "weatherTips", label: "Weather tips", type: "list", factPath: "weather.tips" },
      { key: "whatToPack", label: "What to pack/prepare", type: "list", placeholder: "E.g. rain jacket, waterproof bag..." },
      { key: "trainingImpact", label: "Impact on activities", type: "textarea", placeholder: "E.g. outdoor activities may move indoors..." },
    ],
  },
  {
    id: "late_night",
    title: "Late Night Arrival",
    description: "Special instructions for guests arriving after dark",
    category: "situational",
    icon: "🌙",
    defaultTitle: "Arriving Late at Night",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "lastFlight", label: "Last flights approximate time", type: "text", factPath: "lateNight.lastFlightApprox" },
      { key: "safetyTips", label: "Safety tips", type: "list", factPath: "lateNight.safetyTips" },
      { key: "transportAvailability", label: "Late-night transport", type: "text", factPath: "lateNight.transportAvailability" },
      { key: "campArrival", label: "What to expect arriving late", type: "textarea", placeholder: "E.g. night reception, where to find keys..." },
    ],
  },
  {
    id: "bkk_connection",
    title: "BKK → Samui Connection",
    description: "Guide for guests connecting through Bangkok to reach Koh Samui",
    category: "situational",
    icon: "✈️",
    defaultTitle: "Connecting via Bangkok",
    airports: ["bkk"],
    guidedFields: [
      { key: "flightInfo", label: "Domestic flight info", type: "textarea", placeholder: "Bangkok Airways info, terminal, booking tips..." },
      { key: "transferProcess", label: "Terminal transfer process", type: "textarea", placeholder: "How to get from international arrivals to domestic departure..." },
      { key: "timingTips", label: "Timing tips", type: "list", placeholder: "E.g. minimum connection time, buffer recommendations..." },
      { key: "alternatives", label: "Alternative options", type: "textarea", placeholder: "Bus+ferry combos, overnight options..." },
    ],
  },
  {
    id: "first_time_thailand",
    title: "First Time in Thailand",
    description: "Cultural tips and basics for guests who've never visited Thailand",
    category: "situational",
    icon: "🇹🇭",
    defaultTitle: "First Time in Thailand?",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "culturalTips", label: "Cultural tips", type: "list", placeholder: "E.g. wai greeting, shoes off indoors, respect for royalty..." },
      { key: "practicalBasics", label: "Practical basics", type: "list", placeholder: "E.g. currency, tipping, electrical outlets..." },
      { key: "foodTips", label: "Food & drink tips", type: "list", placeholder: "E.g. street food safety, spice levels, drinking water..." },
      { key: "usefulPhrases", label: "Useful Thai phrases", type: "list", placeholder: "E.g. Sawasdee (hello), Khop khun (thank you)..." },
    ],
  },

  // ── Custom ──
  {
    id: "custom",
    title: "Custom Section",
    description: "Create a completely custom section with your own content",
    category: "custom",
    icon: "✏️",
    defaultTitle: "Custom Section",
    airports: ["bkk", "samui"],
    guidedFields: [
      { key: "sectionTitle", label: "Section title", type: "text", placeholder: "Your section title..." },
      { key: "content", label: "Section content", type: "textarea", placeholder: "Write your content or describe what you want AI to generate..." },
    ],
  },
];

/** Get the fact value from a dot-path like "immigration.estimatedTime" */
export function getFactValue(facts: AirportFacts, path: string): any {
  const keys = path.split(".");
  let current: any = facts;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/** Get templates available for a specific airport */
export function getTemplatesForAirport(airport: "bkk" | "samui"): SectionTemplate[] {
  return SECTION_TEMPLATES.filter(t => t.airports.includes(airport));
}

/** Get journey templates (core flow) */
export function getJourneyTemplates(airport: "bkk" | "samui"): SectionTemplate[] {
  return getTemplatesForAirport(airport).filter(t => t.category === "journey");
}

/** Get situational templates */
export function getSituationalTemplates(airport: "bkk" | "samui"): SectionTemplate[] {
  return getTemplatesForAirport(airport).filter(t => t.category === "situational");
}
