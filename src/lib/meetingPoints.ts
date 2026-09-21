/**
 * Where the guest physically meets their driver, per arrival airport.
 * Kept blunt and short on purpose — this text is read on a phone, one-handed,
 * right after a long flight.
 */
export const MEETING_POINTS: Record<string, { label: string; point: string; detail: string }> = {
  usm: {
    label: "USM — Koh Samui",
    point: "Main exit, covered driver area",
    detail: "Walk straight out of the open-air arrivals hall. Your driver waits under the covered area with a name sign.",
  },
  samui: {
    label: "USM — Koh Samui",
    point: "Main exit, covered driver area",
    detail: "Walk straight out of the open-air arrivals hall. Your driver waits under the covered area with a name sign.",
  },
  bkk: {
    label: "BKK — Suvarnabhumi",
    point: "Level 2 arrivals, Meeting Point A",
    detail: "Exit customs, stay on Level 2 and walk to Meeting Point A. Do not go down to the taxi ranks.",
  },
  dmk: {
    label: "DMK — Don Mueang",
    point: "Terminal 1 arrivals, Gate 3 exit",
    detail: "Come out of arrivals and stand by the Gate 3 exit. Drivers are not allowed inside.",
  },
  urt: {
    label: "URT — Surat Thani",
    point: "Main exit outside arrivals",
    detail: "Single exit — step outside and look for your name sign. Ferry transfers are handled from here.",
  },
};

export function meetingPointFor(airportCode?: string | null) {
  if (!airportCode) return null;
  return MEETING_POINTS[airportCode.toLowerCase()] ?? null;
}
