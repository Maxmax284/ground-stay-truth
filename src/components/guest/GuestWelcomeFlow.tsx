import { AirportGuidanceCard } from "@/components/guest/AirportGuidanceCard";
import { ArrivalCountdown } from "@/components/guest/ArrivalCountdown";
import { IslandGuideCard } from "@/components/guest/IslandGuideCard";
import { GuestPickupCard } from "@/components/GuestPickupCard";
import type { JourneyStage } from "@/lib/guestJourneyStage";

/**
 * The welcome flow: the same cards the portal already had, put in the order the
 * guest needs them for the stage they're at.
 *
 * Order is the whole point — countdown, then the airport they're actually
 * standing in, then the pickup, then the island once they're here. Nothing new
 * is fetched or decided: every card owns its own data and this only arranges
 * them. No booking, payment, flight, pickup or check-in state is touched.
 *
 * `stage` comes from resolveJourneyStage, which is presentation-only and never
 * treats aircraft status as the guest's whereabouts.
 */

export interface GuestWelcomeFlowProps {
  stage: JourneyStage | null;
  bookingId: string | null;
  checkIn: string | null;
  unitName?: string | null;
  guestName?: string | null;
  /** Airport for the leg they're on, already resolved by the portal. */
  legAirport: { code: string; label: string } | null;
  /** Staff have enabled a pickup for this booking. */
  pickupEnabled: boolean;
}

/** Stages where the countdown is still useful. */
const COUNTDOWN_STAGES: JourneyStage[] = ["preparing", "transit", "bangkok", "island_approach"];

export function GuestWelcomeFlow({
  stage,
  bookingId,
  checkIn,
  unitName,
  guestName,
  legAirport,
  pickupEnabled,
}: GuestWelcomeFlowProps) {
  if (!stage) return null;

  const inHouse = stage === "in_house";
  const arrivalDay = stage === "island_approach" || stage === "pickup";
  // Only hoisted on arrival day, so the pickup card never appears twice.
  const showPickup = arrivalDay && pickupEnabled && !!bookingId;

  return (
    <div className="space-y-4">
      {/* 1. How long until they're here. Hidden once they're checked in. */}
      {COUNTDOWN_STAGES.includes(stage) && (
        <ArrivalCountdown checkIn={checkIn} unitName={unitName} />
      )}

      {/* 2. The airport on this leg — orientation, not instructions. */}
      {!inHouse && legAirport && (
        <AirportGuidanceCard airportCode={legAirport.code} legLabel={legAirport.label} />
      )}

      {/* 3. Pickup: meeting point, driver, the one "I'm ready" action the
             card already owns. Staff arrange it; this only shows it. */}
      {showPickup && bookingId && (
        <GuestPickupCard bookingId={bookingId} guestName={guestName ?? null} />
      )}

      {/* 4. The island guide. On arrival day the team's first-day picks lead;
             once checked in it's ordinary discovery. */}
      <IslandGuideCard arrivalMode={arrivalDay || inHouse} />
    </div>
  );
}
