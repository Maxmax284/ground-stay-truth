/**
 * Hardcoded arrival location fact sheets for BKK, USM, piers, and bus.
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

// ── Pier & Bus Fact Sheets ──────────────────────────────────────────────────

export interface PierFacts {
  code: string;
  name: string;
  fullName: string;
  type: string;
  arrival: {
    estimatedDisembarkTime: string;
    tips: string[];
  };
  facilities: {
    layout: string;
    waitingArea: string;
    food: string;
    shops: string;
    toilets: string;
    tips: string[];
  };
  transport: {
    toCamp: TransportOption[];
    tips: string[];
  };
  routeToCamp: {
    estimatedTime: string;
    landmarks: string[];
    description: string;
  };
  connectivity: {
    wifi: string;
    tips: string[];
  };
  weather: {
    rainySeasonMonths: string;
    seaConditionNote: string;
    tips: string[];
  };
  timing: {
    firstFerry: string;
    lastFerry: string;
    peakTimes: string;
    delayNotes: string;
  };
}

export interface BusFacts {
  code: string;
  name: string;
  fullName: string;
  type: string;
  arrival: {
    estimatedArrivalVariance: string;
    tips: string[];
  };
  dropoff: {
    location: string;
    description: string;
    tips: string[];
  };
  transport: {
    toCamp: TransportOption[];
    tips: string[];
  };
  routeToCamp: {
    estimatedTime: string;
    landmarks: string[];
    description: string;
  };
  connectivity: {
    tips: string[];
  };
  timing: {
    notes: string;
    delayCommon: boolean;
    tips: string[];
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
        "Have your passport, boarding pass, and TDAC confirmation ready",
        "Use the e-gates if your nationality is eligible (US, EU, etc.)",
        "Visa on Arrival queue is separate — follow 'VOA' signs if needed",
        "Peak hours: 00:00–03:00 when many long-haul flights land simultaneously",
      ],
      formRequired: "Thailand Digital Arrival Card (TDAC) — complete online before travel at tdac.immigration.go.th",
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
        "Same documents as BKK: passport + TDAC confirmation",
        "If arriving from BKK domestic, no immigration (already cleared at BKK)",
      ],
      formRequired: "Thailand Digital Arrival Card (TDAC) — complete online before travel at tdac.immigration.go.th",
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
          name: "LMT CampStay pickup (arranged)",
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

  dmk: {
    code: "DMK",
    name: "Don Mueang",
    fullName: "Don Mueang International Airport (DMK)",
    type: "Bangkok's secondary airport — budget carrier hub (AirAsia, Nok Air, Thai Lion)",
    immigration: {
      estimatedTime: "15–45 minutes — usually faster than BKK",
      tips: [
        "Have passport and TDAC confirmation ready",
        "Smaller and less crowded than Suvarnabhumi (BKK)",
        "If arriving on a domestic flight, no immigration needed",
      ],
      formRequired: "Thailand Digital Arrival Card (TDAC) — complete online before travel at tdac.immigration.go.th",
      eVisaAvailable: true,
    },
    customs: {
      greenChannel: true,
      declarationForm: false,
      tips: [
        "Walk through the green channel unless declaring something",
        "Same restrictions: no vapes/e-cigarettes, alcohol/cigarette limits apply",
      ],
    },
    simCards: {
      providers: ["AIS", "TrueMove H", "DTAC"],
      locations: "Arrivals hall — counters near the exit",
      costRange: "฿299–฿599 tourist SIM (7–30 days)",
      tips: [
        "AIS and TrueMove H both have great Samui coverage",
        "Bring passport for SIM registration",
        "If counters are closed late at night, any 7-Eleven sells SIMs",
      ],
    },
    cash: {
      atmLocations: "ATMs in arrivals area — multiple options",
      exchangeLocations: "Exchange counters at arrivals. SuperRich kiosks tend to give the best rates.",
      tips: [
        "฿220 ATM fee for foreign cards — withdraw a larger amount",
        "Cash is king on Samui — have baht ready",
      ],
      recommendedAmount: "฿5,000–10,000 for first few days",
    },
    transport: {
      toCamp: [
        {
          name: "Domestic flight DMK → USM",
          cost: "฿1,500–4,000",
          duration: "~1.5 hours flight + transfers",
          notes: "AirAsia and Nok Air operate budget flights. Often cheaper than BKK direct flights to Samui.",
        },
        {
          name: "Flight DMK → URT (Surat Thani) + ferry",
          cost: "฿1,200–2,500 total",
          duration: "~4–6 hours total (flight + transfer + ferry)",
          notes: "Popular budget route. Fly to Surat Thani, take a transfer bus to Donsak Pier, then ferry to Samui. Lomprayah and Raja Ferry operate the route.",
        },
        {
          name: "Lomprayah / bus + ferry combo",
          cost: "฿1,100–1,500",
          duration: "~10–12 hours",
          notes: "Long but cheap overland option. Departs from central Bangkok areas.",
        },
      ],
      withinAirport: [
        "Free shuttle bus between DMK and BKK (~50 min, 04:00–24:00)",
        "Metered taxis from Level 1 (meter + ฿50 surcharge)",
        "Grab/Bolt available from Level 1",
        "Airport bus to central Bangkok (฿30–50)",
      ],
      tips: [
        "DMK has 2 terminals — T1 (international) and T2 (domestic). Walking distance between them.",
        "If connecting from international to domestic flight, allow 2+ hours",
        "Always use the official taxi queue — never the touts inside",
      ],
    },
    terminal: {
      layout: "Two terminals (T1 international, T2 domestic) connected by a covered walkway",
      floors: "Standard layout — Arrivals on Level 1, Departures on Level 3",
      meetingPoints: ["Arrivals hall meeting point near exit", "Information counters in both terminals"],
      food: "Food court on Level 4. 7-Eleven and small cafes throughout. 24-hour options available.",
      tips: [
        "Free WiFi: 'DMK Free WiFi' — re-register every 2 hours",
        "Smaller and easier to navigate than BKK",
        "Luggage carts free in arrivals",
      ],
    },
    routeToCamp: {
      estimatedTime: "Not direct — connecting flight or flight+ferry needed to reach Samui",
      landmarks: ["DMK → USM (direct flight)", "DMK → URT → Donsak Pier → Nathon", "Final 20–30 min drive to camp"],
      description: "DMK is in northern Bangkok, ~30km from BKK. Guests must take a connecting flight or the budget flight+ferry route via Surat Thani to reach Koh Samui. From the Samui airport or pier, the camp is 20–30 min south to Lamai.",
    },
    weather: {
      rainySeasonMonths: "May – October (Bangkok pattern, different from Samui)",
      hotSeasonMonths: "March – May",
      tips: [
        "Bangkok weather doesn't predict Samui weather — they have separate patterns",
        "Pack a light layer — flights and airports are heavily air-conditioned",
      ],
    },
    connectivity: {
      airportWifi: "'DMK Free WiFi' — 2-hour sessions, re-register to extend",
      tips: [
        "WiFi is decent for messaging — slow for downloads",
        "Get a SIM if you'll be in Bangkok for any layover time",
      ],
    },
    lateNight: {
      lastFlightApprox: "Arrivals continue past midnight on budget routes",
      safetyTips: [
        "DMK is safe 24/7 with active security",
        "Use only the official taxi queue",
        "Late-night Grab works but surge pricing applies",
      ],
      transportAvailability: "Taxis 24/7. Free shuttle to BKK runs 04:00–24:00. Airport buses limited overnight.",
    },
  },

  urt: {
    code: "URT",
    name: "Surat Thani",
    fullName: "Surat Thani International Airport (URT)",
    type: "Small mainland airport — gateway to the Samui-Phangan-Tao ferry route",
    immigration: {
      estimatedTime: "5–15 minutes (small airport, fast)",
      tips: [
        "Most arrivals here are domestic (no immigration)",
        "International immigration only for limited regional flights",
      ],
      formRequired: "TDAC required for international arrivals — complete online beforehand",
      eVisaAvailable: false,
    },
    customs: {
      greenChannel: true,
      declarationForm: false,
      tips: [
        "Very relaxed — most passengers walk straight through",
      ],
    },
    simCards: {
      providers: ["AIS", "TrueMove H"],
      locations: "Limited counters at arrivals — 7-Eleven nearby is reliable backup",
      costRange: "฿299–฿499 tourist SIM",
      tips: [
        "If you didn't grab a SIM in Bangkok, do it here — coverage is solid on the ferry route",
        "AIS works best across Surat Thani → Donsak → Samui",
      ],
    },
    cash: {
      atmLocations: "1–2 ATMs at arrivals",
      exchangeLocations: "Limited — better to arrive with baht already",
      tips: [
        "Withdraw enough cash here for your transfer + ferry tickets",
        "Ferry counters often prefer cash",
      ],
      recommendedAmount: "฿2,000–3,000 for transfer + ferry + snacks",
    },
    transport: {
      toCamp: [
        {
          name: "Airport transfer bus + Lomprayah / Raja ferry",
          cost: "฿400–800 combo ticket",
          duration: "3–5 hours (transfer ~1.5hr + ferry ~1.5–2hr)",
          notes: "Most common route. Buy combo ticket at airport — they'll bus you to Donsak Pier and you connect to the ferry.",
        },
        {
          name: "Private taxi to Donsak Pier + ferry",
          cost: "฿1,200–1,800 taxi + ฿300–500 ferry",
          duration: "~3 hours total",
          notes: "Faster than bus transfer. Useful if your flight times don't align with the bus.",
        },
        {
          name: "Songserm slow ferry (alternative)",
          cost: "฿200–400 ferry",
          duration: "Longer ferry crossing (~3+ hours)",
          notes: "Cheaper but slower. Only use if you have time and want to save money.",
        },
      ],
      withinAirport: [
        "Tiny single-terminal airport — everything is within 2 minutes walk",
        "Airport buses depart from outside arrivals",
      ],
      tips: [
        "Buy your ferry combo ticket at the airport counter — easier than arranging at the pier",
        "Don't engage with aggressive touts — go to official ferry/transfer counters",
      ],
    },
    terminal: {
      layout: "Single small terminal, single level",
      floors: "One floor only — arrivals and departures share the building",
      meetingPoints: ["Main exit area outside arrivals"],
      food: "Very basic — small cafe and convenience options. Eat on the ferry or at Donsak Pier.",
      tips: [
        "Very calm, easy airport — almost no waiting",
        "If your bus to Donsak isn't ready, there's a covered waiting area",
      ],
    },
    routeToCamp: {
      estimatedTime: "Not direct — transfer to Donsak Pier (~1.5hr) then ferry to Samui (~1.5–2hr)",
      landmarks: ["URT Airport", "Surat Thani town (bypass)", "Donsak Pier", "Ferry crossing", "Nathon or Lipa Noi Pier on Samui", "20–30 min drive to camp"],
      description: "URT is on the mainland, ~70km from Donsak Pier. The standard route: airport transfer bus to Donsak (~1.5hr) → ferry to Samui (~1.5–2hr) → land at Nathon or Lipa Noi → 20–30 min drive south to camp in Lamai.",
    },
    weather: {
      rainySeasonMonths: "October – December (Gulf coast pattern, similar to Samui)",
      hotSeasonMonths: "February – May",
      tips: [
        "Surat Thani weather usually mirrors Samui — if it's stormy here, it might be stormy on the crossing",
        "Heavy rain can delay ferries",
      ],
    },
    connectivity: {
      airportWifi: "Basic free WiFi at the terminal",
      tips: [
        "Mobile signal is solid across the route — AIS/True work well",
        "WiFi on ferries is limited or absent — download offline content beforehand",
      ],
    },
    lateNight: {
      lastFlightApprox: "Last flights ~21:00",
      safetyTips: [
        "Very safe small airport",
        "If you arrive too late for the last ferry, there are guesthouses near Donsak Pier",
      ],
      transportAvailability: "Transfer buses align with flight arrivals. Last ferries usually ~17:00–18:00 — late arrivals may need to overnight on the mainland.",
    },
  },
};

// ── Pier Facts ──────────────────────────────────────────────────────────────

export const PIER_FACTS: Record<string, PierFacts> = {
  nathon: {
    code: "nathon",
    name: "Nathon",
    fullName: "Nathon Pier (Main Ferry Terminal)",
    type: "Main ferry terminal — busiest pier on Koh Samui",
    arrival: {
      estimatedDisembarkTime: "5–15 minutes from docking to exiting the pier area",
      tips: [
        "Follow the crowd off the ferry — the exit is straightforward",
        "If you have large luggage, porters may offer help for ฿50–100",
        "The pier area can be congested during peak ferry arrivals",
        "Have your booking confirmation ready — our driver will look for your name",
      ],
    },
    facilities: {
      layout: "Simple open pier with a covered waiting area. Ticket counters at the entrance.",
      waitingArea: "Covered seating area near ticket offices — no air conditioning",
      food: "A few small food stalls and a 7-Eleven within walking distance (2 min)",
      shops: "Minimal — a couple of convenience shops near the pier entrance",
      toilets: "Basic public toilets available at the pier",
      tips: [
        "Nathon town is right behind the pier — shops, ATMs, and restaurants within 5 min walk",
        "There's a small market area near the pier with local food",
        "The 7-Eleven on the main road is the most reliable for essentials",
      ],
    },
    transport: {
      toCamp: [
        {
          name: "LMT CampStay pickup (arranged)",
          cost: "Included or arranged via booking",
          duration: "30–40 minutes",
          notes: "Our driver meets you at the pier exit. Most reliable option.",
        },
        {
          name: "Songthaew (shared taxi)",
          cost: "฿100–200 per person",
          duration: "40–60 minutes (shared route)",
          notes: "Red/yellow pickup trucks. Cheap but slow — they loop around the island dropping passengers.",
        },
        {
          name: "Private taxi",
          cost: "฿500–800",
          duration: "30–40 minutes",
          notes: "Negotiate price before getting in. No meters on Samui.",
        },
        {
          name: "Grab/Bolt",
          cost: "฿350–600",
          duration: "30–40 minutes",
          notes: "Available but fewer drivers than Bangkok. May wait 10–15 min.",
        },
      ],
      tips: [
        "If pickup is arranged, look for driver with your name at the pier exit",
        "Ignore aggressive taxi touts at the pier — walk past them to find better options",
        "Songthaews follow set routes — confirm they pass through Lamai before boarding",
      ],
    },
    routeToCamp: {
      estimatedTime: "30–40 minutes by car",
      landmarks: [
        "Exit Nathon pier → take the coast road south (Route 4169/4170)",
        "Pass through Nathon town",
        "Continue along the south coast",
        "Pass Hua Thanon fishing village",
        "Enter Lamai area — camp is on the left near Lamai Beach",
      ],
      description: "From Nathon pier, drive south along the coast road. The route passes through the quiet west coast before turning south and east toward Lamai. Scenic drive with mountain and sea views.",
    },
    connectivity: {
      wifi: "No reliable free WiFi at the pier. Use mobile data.",
      tips: [
        "Get a SIM card before taking the ferry if possible",
        "If arriving without a SIM, the 7-Eleven near the pier sells them",
      ],
    },
    weather: {
      rainySeasonMonths: "October – December",
      seaConditionNote: "Ferries may be cancelled during severe weather (Nov–Dec). Check with ferry operator before travel.",
      tips: [
        "Sea conditions can be rough Oct–Dec — take motion sickness medication if prone",
        "Morning ferries tend to have calmer seas than afternoon ones",
        "During monsoon season, delays of 30–60 min are common",
      ],
    },
    timing: {
      firstFerry: "~06:00 (varies by operator)",
      lastFerry: "~19:00 (Lomprayah/Seatran)",
      peakTimes: "Morning arrivals (08:00–10:00) and afternoon (14:00–16:00)",
      delayNotes: "Delays are common, especially in rough seas. Budget extra time.",
    },
  },

  lipa_noi: {
    code: "lipa_noi",
    name: "Lipa Noi",
    fullName: "Lipa Noi Pier (Raja Ferry Terminal)",
    type: "Secondary ferry terminal — mainly Raja Ferry vehicle ferries",
    arrival: {
      estimatedDisembarkTime: "10–20 minutes (vehicle ferry, slower disembark)",
      tips: [
        "Vehicle ferries take longer to unload — be patient",
        "Walk-on passengers disembark before vehicles",
        "The pier area is quieter than Nathon",
      ],
    },
    facilities: {
      layout: "Simple open pier designed for vehicle loading/unloading",
      waitingArea: "Small covered area near the ticket office",
      food: "A couple of food stalls near the pier. Very limited options.",
      shops: "Almost none — bring what you need or stop in Nathon/Lamai later",
      toilets: "Basic facilities available",
      tips: [
        "Lipa Noi is more remote than Nathon — fewer services immediately available",
        "The nearest town with proper shops is Nathon (15 min drive)",
      ],
    },
    transport: {
      toCamp: [
        {
          name: "LMT CampStay pickup (arranged)",
          cost: "Included or arranged via booking",
          duration: "25–35 minutes",
          notes: "Our driver meets you at the pier exit.",
        },
        {
          name: "Private taxi",
          cost: "฿400–700",
          duration: "25–35 minutes",
          notes: "Fewer taxis available here than Nathon. Pre-arrange if possible.",
        },
        {
          name: "Grab/Bolt",
          cost: "฿300–500",
          duration: "25–35 minutes",
          notes: "Limited drivers in this area. Expect longer wait times.",
        },
      ],
      tips: [
        "Pre-arranged pickup is strongly recommended — taxis are scarce here",
        "If no pickup arranged, you may need to wait 15–20 min for a Grab",
      ],
    },
    routeToCamp: {
      estimatedTime: "25–35 minutes by car",
      landmarks: [
        "Exit Lipa Noi pier → head south on the coast road",
        "Pass through quiet residential area",
        "Join the main ring road heading east toward Lamai",
        "Enter Lamai area — camp is near Lamai Beach",
      ],
      description: "Shorter drive than from Nathon. The road cuts across the southern part of the island through quieter, more rural areas before reaching Lamai on the east coast.",
    },
    connectivity: {
      wifi: "No WiFi at the pier.",
      tips: ["Have mobile data ready before arriving — no SIM vendors at this pier"],
    },
    weather: {
      rainySeasonMonths: "October – December",
      seaConditionNote: "Raja Ferry vehicle ferries are more stable but still affected by severe weather.",
      tips: [
        "Vehicle ferries handle rough seas slightly better than catamarans",
        "Check Raja Ferry schedule — fewer daily departures than other operators",
      ],
    },
    timing: {
      firstFerry: "~05:00 (Raja Ferry from Don Sak)",
      lastFerry: "~19:00",
      peakTimes: "Mid-morning (09:00–11:00)",
      delayNotes: "Delays less frequent than catamaran services but still possible in bad weather.",
    },
  },
};

// ── Bus Facts ───────────────────────────────────────────────────────────────

export const BUS_FACTS: BusFacts = {
  code: "bus",
  name: "Bus Arrival",
  fullName: "Bus/Van Arrival to Koh Samui",
  type: "Overland travel — typically combined bus+ferry",
  arrival: {
    estimatedArrivalVariance: "30–90 minutes from scheduled time (delays common)",
    tips: [
      "Bus+ferry combos often run late — don't worry, we'll adjust",
      "Your arrival time will depend on the ferry connection at the mainland",
      "Many operators include the ferry ticket — confirm with your provider",
      "Keep your belongings close during transfers between bus and ferry",
    ],
  },
  dropoff: {
    location: "Varies — usually Nathon Pier or operator's drop-off point",
    description: "Most bus+ferry services drop you at Nathon Pier. Some operators have their own drop-off points near Nathon town.",
    tips: [
      "Confirm your exact drop-off point with the bus/ferry operator",
      "Let us know your operator (Lomprayah, Seatran, etc.) so we know where to meet you",
      "If dropped at Nathon Pier, follow the same exit as ferry passengers",
    ],
  },
  transport: {
    toCamp: [
      {
        name: "LMT CampStay pickup (arranged)",
        cost: "Included or arranged via booking",
        duration: "30–40 minutes from Nathon",
        notes: "We'll coordinate timing based on your estimated arrival. Flexible with delays.",
      },
      {
        name: "Songthaew",
        cost: "฿100–200 per person",
        duration: "40–60 minutes",
        notes: "Available near Nathon. Shared route — slow but cheap.",
      },
      {
        name: "Grab/Bolt",
        cost: "฿350–600",
        duration: "30–40 minutes",
        notes: "Order once you're off the ferry and have phone signal.",
      },
    ],
    tips: [
      "If pickup is arranged, message us your real-time ETA when you board the ferry",
      "We don't need exact times — approximate is fine, we'll be flexible",
    ],
  },
  routeToCamp: {
    estimatedTime: "30–40 minutes from Nathon to camp",
    landmarks: [
      "Same route as from Nathon Pier — south coast road to Lamai",
    ],
    description: "After the ferry docks at Nathon, the drive to camp is the same as for ferry arrivals — south along the coast to Lamai Beach.",
  },
  connectivity: {
    tips: [
      "Many long-distance buses have WiFi but it's unreliable",
      "Make sure you have mobile data for the ferry portion",
      "Signal may drop during the crossing — don't worry, it comes back on Samui",
    ],
  },
  timing: {
    notes: "Bus+ferry combos from Bangkok take 10–14 hours. From Surat Thani, 2–3 hours including ferry.",
    delayCommon: true,
    tips: [
      "Delays of 30–90 min are normal — plan for flexibility",
      "Night buses arrive early morning — you may need to wait for the first ferry",
      "Message us your ferry departure time from the mainland — that's the most useful timing info",
    ],
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
  | "pier_arrival"
  | "pier_facilities"
  | "ferry_timing"
  | "sea_conditions"
  | "bus_arrival"
  | "bus_timing"
  | "custom";

export interface GuidedField {
  key: string;
  label: string;
  type: "text" | "textarea" | "list" | "transport_options";
  /** Dot-path into AirportFacts/PierFacts to auto-fill, e.g. "immigration.estimatedTime" */
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
  /** Which arrival locations this section is relevant for */
  airports: string[];
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

  // ── Post-arrival sections ──
  {
    id: "local_essentials",
    title: "Local Essentials",
    description: "Practical basics for the first hours on Samui — cash, hydration, convenience stores",
    category: "journey",
    icon: "🏪",
    defaultTitle: "Local Essentials",
    airports: ["samui"],
    guidedFields: [
      { key: "nearestShops", label: "Nearest convenience stores", type: "list", placeholder: "E.g. 7-Eleven 2min walk, Family Mart on main road..." },
      { key: "cashTips", label: "Cash & payment tips", type: "list", placeholder: "E.g. nearest ATM, card acceptance, recommended cash..." },
      { key: "hydration", label: "Hydration & health", type: "list", placeholder: "E.g. bottled water, electrolytes, sun protection..." },
      { key: "scooterRental", label: "Scooter rental (brief mention)", type: "textarea", placeholder: "Where to rent, license requirements, helmet note..." },
      { key: "additionalNotes", label: "Additional notes", type: "textarea", placeholder: "Anything else guests should know right away..." },
    ],
  },
  {
    id: "first_24_hours",
    title: "First 24 Hours",
    description: "Orientation guide for settling in — what to do, where to go, cultural tips",
    category: "journey",
    icon: "🌅",
    defaultTitle: "Your First 24 Hours",
    airports: ["samui"],
    guidedFields: [
      { key: "firstEvening", label: "First evening tips", type: "textarea", placeholder: "E.g. dinner options, where to eat, jet lag advice..." },
      { key: "morningRoutine", label: "First morning", type: "textarea", placeholder: "E.g. breakfast time, morning activities, orientation..." },
      { key: "localDosAndDonts", label: "Local do's and don'ts", type: "list", placeholder: "E.g. remove shoes indoors, dress modestly at temples..." },
      { key: "gettingAround", label: "Getting around the area", type: "textarea", placeholder: "E.g. walking, songthaew, Grab app, motorbike..." },
      { key: "mustKnow", label: "Must-know for day one", type: "list", placeholder: "E.g. meal times, WiFi password, emergency contact..." },
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
    airports: ["bkk", "samui", "nathon", "lipa_noi", "bus"],
    guidedFields: [
      { key: "culturalTips", label: "Cultural tips", type: "list", placeholder: "E.g. wai greeting, shoes off indoors, respect for royalty..." },
      { key: "practicalBasics", label: "Practical basics", type: "list", placeholder: "E.g. currency, tipping, electrical outlets..." },
      { key: "foodTips", label: "Food & drink tips", type: "list", placeholder: "E.g. street food safety, spice levels, drinking water..." },
      { key: "usefulPhrases", label: "Useful Thai phrases", type: "list", placeholder: "E.g. Sawasdee (hello), Khop khun (thank you)..." },
    ],
  },

  // ── Pier-specific sections ──
  {
    id: "pier_arrival",
    title: "Pier Arrival",
    description: "What to expect when the ferry docks and you step off",
    category: "journey",
    icon: "⚓",
    defaultTitle: "Arriving at the Pier",
    airports: ["nathon", "lipa_noi"],
    guidedFields: [
      { key: "disembarkTime", label: "Estimated disembark time", type: "text", placeholder: "E.g. 5–15 minutes from docking..." },
      { key: "arrivalTips", label: "Arrival tips", type: "list", placeholder: "E.g. follow the crowd, have booking ready..." },
      { key: "meetingPoint", label: "Where to meet your driver", type: "textarea", placeholder: "E.g. exit the pier and look for name sign..." },
      { key: "additionalNotes", label: "Additional notes", type: "textarea" },
    ],
  },
  {
    id: "pier_facilities",
    title: "Pier Facilities",
    description: "What's available at the pier — food, shops, toilets, ATMs",
    category: "journey",
    icon: "🏪",
    defaultTitle: "At the Pier",
    airports: ["nathon", "lipa_noi"],
    guidedFields: [
      { key: "layout", label: "Pier layout", type: "textarea", placeholder: "Describe the pier layout..." },
      { key: "food", label: "Food & drink options", type: "text", placeholder: "E.g. food stalls, 7-Eleven nearby..." },
      { key: "shops", label: "Shops & services", type: "text", placeholder: "E.g. convenience stores, ATMs..." },
      { key: "tips", label: "Useful tips", type: "list", placeholder: "E.g. Nathon town is 5 min walk..." },
    ],
  },
  {
    id: "ferry_timing",
    title: "Ferry Schedule & Timing",
    description: "Ferry schedules, peak times, and what to expect with delays",
    category: "situational",
    icon: "⏱️",
    defaultTitle: "Ferry Timing",
    airports: ["nathon", "lipa_noi"],
    guidedFields: [
      { key: "firstFerry", label: "First ferry", type: "text", placeholder: "E.g. ~06:00..." },
      { key: "lastFerry", label: "Last ferry", type: "text", placeholder: "E.g. ~19:00..." },
      { key: "peakTimes", label: "Peak arrival times", type: "text", placeholder: "E.g. 08:00–10:00, 14:00–16:00..." },
      { key: "delayNotes", label: "Delay expectations", type: "textarea", placeholder: "E.g. delays common in rough weather..." },
    ],
  },
  {
    id: "sea_conditions",
    title: "Sea Conditions & Weather",
    description: "Seasonal sea conditions and how they affect ferry travel",
    category: "situational",
    icon: "🌊",
    defaultTitle: "Sea & Weather Conditions",
    airports: ["nathon", "lipa_noi"],
    guidedFields: [
      { key: "rainyMonths", label: "Rough sea months", type: "text", placeholder: "E.g. October – December..." },
      { key: "seaNote", label: "Sea condition note", type: "textarea", placeholder: "E.g. ferries may be cancelled in severe weather..." },
      { key: "tips", label: "Tips for rough seas", type: "list", placeholder: "E.g. take morning ferry, bring motion sickness meds..." },
    ],
  },

  // ── Bus-specific sections ──
  {
    id: "bus_arrival",
    title: "Bus/Van Arrival",
    description: "What to expect when arriving by bus or van combo",
    category: "journey",
    icon: "🚌",
    defaultTitle: "Arriving by Bus",
    airports: ["bus"],
    guidedFields: [
      { key: "arrivalVariance", label: "Expected timing variance", type: "text", placeholder: "E.g. 30–90 minutes from scheduled time..." },
      { key: "dropoffLocation", label: "Drop-off location", type: "textarea", placeholder: "E.g. usually Nathon Pier or operator drop-off..." },
      { key: "arrivalTips", label: "Arrival tips", type: "list", placeholder: "E.g. confirm drop-off point with operator..." },
      { key: "meetingPoint", label: "Where to meet your driver", type: "textarea", placeholder: "E.g. we'll coordinate based on your ETA..." },
    ],
  },
  {
    id: "bus_timing",
    title: "Bus Journey & Timing",
    description: "Journey duration, delays, and timing tips for bus+ferry combos",
    category: "situational",
    icon: "🕐",
    defaultTitle: "Bus Timing & Delays",
    airports: ["bus"],
    guidedFields: [
      { key: "journeyDuration", label: "Typical journey duration", type: "text", placeholder: "E.g. 10–14 hours from Bangkok..." },
      { key: "delayNotes", label: "Delay expectations", type: "textarea", placeholder: "E.g. 30–90 min delays normal..." },
      { key: "tips", label: "Timing tips", type: "list", placeholder: "E.g. message us your ferry departure time..." },
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
    airports: ["bkk", "samui", "nathon", "lipa_noi", "bus"],
    guidedFields: [
      { key: "sectionTitle", label: "Section title", type: "text", placeholder: "Your section title..." },
      { key: "content", label: "Section content", type: "textarea", placeholder: "Write your content or describe what you want AI to generate..." },
    ],
  },
];

/** Get the fact value from a dot-path like "immigration.estimatedTime" */
export function getFactValue(facts: AirportFacts | PierFacts | BusFacts, path: string): any {
  const keys = path.split(".");
  let current: any = facts;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

/** All arrival locations the editor supports */
export const ALL_ARRIVAL_LOCATIONS = [
  { id: "bkk", label: "BKK (Suvarnabhumi)", icon: "✈️", category: "airport" as const },
  { id: "samui", label: "Samui (USM)", icon: "🌴", category: "airport" as const },
  { id: "nathon", label: "Nathon Pier", icon: "⛴️", category: "pier" as const },
  { id: "lipa_noi", label: "Lipa Noi Pier", icon: "🚢", category: "pier" as const },
  { id: "bus", label: "Bus / Van", icon: "🚌", category: "bus" as const },
] as const;

/** Get fact sheet for any arrival location */
export function getFactsForLocation(locationId: string): AirportFacts | PierFacts | BusFacts | null {
  if (locationId === "bkk" || locationId === "samui") return AIRPORT_FACTS[locationId];
  if (locationId === "nathon" || locationId === "lipa_noi") return PIER_FACTS[locationId];
  if (locationId === "bus") return BUS_FACTS;
  return null;
}

/** Get templates available for a specific location */
export function getTemplatesForAirport(airport: string): SectionTemplate[] {
  return SECTION_TEMPLATES.filter(t => t.airports.includes(airport));
}

/** Get journey templates (core flow) */
export function getJourneyTemplates(airport: string): SectionTemplate[] {
  return getTemplatesForAirport(airport).filter(t => t.category === "journey");
}

/** Get situational templates */
export function getSituationalTemplates(airport: string): SectionTemplate[] {
  return getTemplatesForAirport(airport).filter(t => t.category === "situational");
}
