/**
 * Guest journey stage — the visual context layer only.
 *
 * This decides which welcome imagery, tint and one-line orientation the guest
 * portal wears. It is PURE PRESENTATION: it never changes a booking, payment,
 * room, pickup or check-in, and it never infers nationality, language or a
 * guest's physical location. Aircraft status is aircraft status.
 *
 * It is derived entirely from data the portal already has.
 */

export type JourneyStage =
  | "preparing"
  | "transit"
  | "bangkok"
  | "island_approach"
  | "pickup"
  | "in_house";

/** Values already produced by GuestPortal. */
export type NowStateInput = "deposit" | "flight" | "onsite" | "quiet" | "none";
export type JourneyPhaseInput =
  | "pre_arrival"
  | "transit"
  | "arrival"
  | "stay"
  | "departure"
  | undefined;

export interface JourneyStageArgs {
  nowState: NowStateInput;
  journeyPhase: JourneyPhaseInput;
  /** A pickup row exists for the imminent booking (staff-arranged, not inferred). */
  awaitingPickup?: boolean;
}

/**
 * Resolve the visual stage. Returns null when there is nothing to dress up
 * (no booking at all) so the portal stays completely plain.
 */
export function resolveJourneyStage({
  nowState,
  journeyPhase,
  awaitingPickup = false,
}: JourneyStageArgs): JourneyStage | null {
  if (nowState === "none") return null;

  // Checked in beats everything — no radar, no transit theatre.
  if (nowState === "onsite" || journeyPhase === "stay" || journeyPhase === "departure") {
    return "in_house";
  }

  // Guest has confirmed they are on the ground in Bangkok mid-itinerary.
  if (journeyPhase === "transit") return "bangkok";

  // Arrival day on the island.
  if (journeyPhase === "arrival") return awaitingPickup ? "pickup" : "island_approach";

  // Travelling within the next couple of days.
  if (nowState === "flight") return "transit";

  return "preparing";
}

export interface StageTheme {
  stage: JourneyStage;
  /** i18n key for the short stage chip. */
  titleKey: string;
  /** i18n key for the single orientation line. */
  lineKey: string;
  /** Fallback English copy so nothing ever renders a raw key. */
  titleFallback: string;
  lineFallback: string;
  /** Token-driven tint class, no hardcoded colours. */
  tintClass: string;
}

export const STAGE_THEMES: Record<JourneyStage, StageTheme> = {
  preparing: {
    stage: "preparing",
    titleKey: "journeyStage.preparing.title",
    lineKey: "journeyStage.preparing.line",
    titleFallback: "Getting ready",
    lineFallback: "Nothing urgent. We'll tell you what matters, when it matters.",
    tintClass: "journey-tint-calm",
  },
  transit: {
    stage: "transit",
    titleKey: "journeyStage.transit.title",
    lineKey: "journeyStage.transit.line",
    titleFallback: "On the way",
    lineFallback: "We're watching your flights. Your next step stays at the top of this page.",
    tintClass: "journey-tint-travel",
  },
  bangkok: {
    stage: "bangkok",
    titleKey: "journeyStage.bangkok.title",
    lineKey: "journeyStage.bangkok.line",
    titleFallback: "Bangkok connection",
    lineFallback: "One more hop. Take your time — immigration and bags come first.",
    tintClass: "journey-tint-travel",
  },
  island_approach: {
    stage: "island_approach",
    titleKey: "journeyStage.islandApproach.title",
    lineKey: "journeyStage.islandApproach.line",
    titleFallback: "Almost on the island",
    lineFallback: "Samui today. Tell us when you're actually ready and we'll move.",
    tintClass: "journey-tint-island",
  },
  pickup: {
    stage: "pickup",
    titleKey: "journeyStage.pickup.title",
    lineKey: "journeyStage.pickup.line",
    titleFallback: "Your pickup",
    lineFallback: "Meeting point and driver details are right here. No rush.",
    tintClass: "journey-tint-island",
  },
  in_house: {
    stage: "in_house",
    titleKey: "journeyStage.inHouse.title",
    lineKey: "journeyStage.inHouse.line",
    titleFallback: "Welcome to Lamai",
    lineFallback: "You're checked in. Training, essentials and the front desk are one tap away.",
    tintClass: "journey-tint-home",
  },
};
