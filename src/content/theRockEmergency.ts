/**
 * Verified emergency data for THE ROCK guest edition.
 * Verified against published official sources only; no line was test-called.
 * Each record keeps its source + verification date for future re-checks.
 */
export const SOURCES_CHECKED = "2026-10-08";
export const SOURCES_CHECKED_LABEL = "October 8, 2026";

export interface ContactRecord {
  label: string;
  numbers: { display: string; tel: string; note?: string }[];
  area?: string;
  priority?: boolean;
  sources: string[];
  verifiedOn: string;
  /** When false, held back from the guest view until reconfirmed. */
  guestVisible: boolean;
  holdReason?: string;
}

const NATIONAL_SOURCES = [
  "https://www.tourismthailand.org/Plan-Your-Trip/Useful-Call",
  "https://www.touristpolice.go.th/en/main",
  "https://info.go.th/emergency-number",
];

const n = (display: string, note?: string) => ({ display, tel: display.replace(/[^\d]/g, ""), note });

export const NATIONAL_CONTACTS: ContactRecord[] = [
  { label: "Medical emergency / Ambulance", numbers: [n("1669")], priority: true, sources: NATIONAL_SOURCES, verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Police / General emergency", numbers: [n("191")], priority: true, sources: NATIONAL_SOURCES, verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Tourist Police", numbers: [n("1155")], priority: true, sources: NATIONAL_SOURCES, verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Fire / Rescue", numbers: [n("199")], sources: NATIONAL_SOURCES, verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Water accidents", numbers: [n("1196")], sources: NATIONAL_SOURCES, verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Tourism Authority assistance", numbers: [n("1672")], sources: NATIONAL_SOURCES, verifiedOn: SOURCES_CHECKED, guestVisible: true },
];

export const SAMUI_HOSPITALS: ContactRecord[] = [
  { label: "Bangkok Hospital Samui", area: "Chaweng / Bo Phut", numbers: [n("077-429-500")], sources: ["https://www.bangkokhospital.com/en/samui"], verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Koh Samui Hospital (public)", area: "Nathon", numbers: [n("077-913-200")], sources: ["https://cpp.nhso.go.th/search/?q=10742"], verifiedOn: SOURCES_CHECKED, guestVisible: true },
  { label: "Wattanapat Hospital Samui", area: "Bo Phut", numbers: [n("077-965-998", "Emergency"), n("077-965-889", "General")], sources: ["https://samuihospital.com/en/contact"], verifiedOn: SOURCES_CHECKED, guestVisible: true },
  {
    label: "Samui International Hospital", area: "Northern Chaweng",
    numbers: [n("077-300-394"), n("077-300-395")],
    sources: ["Australian Embassy hospital directory, August 2025"],
    verifiedOn: SOURCES_CHECKED, guestVisible: false,
    holdReason: "Secondary source only; reconfirm directly with the hospital before showing guests.",
  },
];

export const JELLYFISH_SOURCE = "https://www.dmcr.go.th/detailAll/71140/nws/";
