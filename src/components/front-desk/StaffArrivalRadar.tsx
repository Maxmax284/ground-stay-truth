import { useMemo } from "react";
import { MetroEchoRadar, type MetroLeg } from "@/components/MetroEchoRadar";
import { useFlightTrackingBatch, FLIGHT_STATUS_CONFIG } from "@/hooks/useFlightTracking";
import { formatCampLabeled } from "@/lib/timezone";

interface Props {
  pickupId: string;
  /** First flight into Thailand, if the guest connects. */
  intlFlightNumber?: string | null;
  /** The flight that actually lands where we meet them. */
  finalFlightNumber?: string | null;
  guestLandedAt?: string | null;
  guestReadyAt?: string | null;
  collectedAt?: string | null;
}

/**
 * The same Metro Echo radar the guest sees, mounted inside the staff pickup
 * panel so the team watches the aircraft live instead of re-reading badges.
 *
 * Doctrine: this scope tracks an AIRCRAFT, never a person. Guest readiness only
 * ever comes from the guest tapping "I'm ready" or staff tapping "Collected",
 * so the footer says so out loud.
 */
export function StaffArrivalRadar({
  pickupId,
  intlFlightNumber,
  finalFlightNumber,
  guestLandedAt,
  guestReadyAt,
  collectedAt,
}: Props) {
  const { data: tracking } = useFlightTrackingBatch(pickupId ? [pickupId] : []);
  const flight = tracking?.[pickupId];

  const view = useMemo(() => {
    const status = flight?.flight_status ?? null;
    const arrived = status === "landed" || !!guestLandedAt;

    let leg: MetroLeg = "inbound";
    if (arrived) leg = "arrived";
    else if (status === "in_air") leg = intlFlightNumber ? "transit" : "island";
    else leg = "inbound";

    const statusLabel = status
      ? FLIGHT_STATUS_CONFIG[status]?.label ?? status
      : "No flight data on record";

    const eta = flight?.actual_arrival ?? flight?.estimated_arrival ?? flight?.scheduled_arrival ?? null;

    // One plain line telling staff what the aircraft state does and does not mean.
    let transitLine: string;
    if (collectedAt) {
      transitLine = `Guest collected ${formatCampLabeled(collectedAt)}. Nothing further needed here.`;
    } else if (guestReadyAt) {
      transitLine = `Guest is out with bags and waiting since ${formatCampLabeled(guestReadyAt)}. Driver should be moving.`;
    } else if (arrived) {
      transitLine = "Aircraft is down. Guest is still clearing immigration and bags — not ready for pickup yet.";
    } else if (status === "cancelled" || status === "diverted") {
      transitLine = "This flight will not arrive as planned. Someone needs to speak to the guest.";
    } else if (!status) {
      transitLine = "No live reading for this flight yet. Times shown are whatever a person entered.";
    } else {
      transitLine = "Aircraft still en route. No pickup action until the guest says they are out.";
    }

    return { leg, statusLabel, eta, transitLine };
  }, [flight, guestLandedAt, guestReadyAt, collectedAt, intlFlightNumber]);

  if (!pickupId) return null;

  return (
    <MetroEchoRadar
      intlFlight={intlFlightNumber ?? null}
      finalFlight={finalFlightNumber ?? flight?.flight_number ?? null}
      leg={view.leg}
      statusLabel={view.statusLabel}
      etaLabel={view.eta ? formatCampLabeled(view.eta) : null}
      delayMinutes={flight?.delay_minutes ?? null}
      gate={flight?.gate ?? null}
      terminal={flight?.terminal ?? null}
      transitLine={view.transitLine}
    />
  );
}

export default StaffArrivalRadar;
