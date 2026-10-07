import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { GroundRadar, type RadarLeg } from "@/components/GroundRadar";
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
 * The same Ground Radar scope the guest sees, mounted inside the staff pickup
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
  const qc = useQueryClient();

  // Live: re-read the moment the radar poller writes a new reading for this pickup.
  useEffect(() => {
    if (!pickupId) return;
    const ch = supabase
      .channel(`flight-radar-${pickupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flight_tracking", filter: `pickup_id=eq.${pickupId}` },
        () => qc.invalidateQueries({ queryKey: ["flight_tracking_batch"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pickupId, qc]);

  const view = useMemo(() => {
    const status = flight?.flight_status ?? null;
    const arrived = status === "landed" || !!guestLandedAt;

    let leg: RadarLeg = "inbound";
    if (arrived) leg = "arrived";
    else if (status === "in_air") leg = intlFlightNumber ? "transit" : "island";
    else leg = "inbound";

    const statusLabel = status
      ? FLIGHT_STATUS_CONFIG[status]?.label ?? status
      : "Radar standby · no live reading yet";

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

    const dep = flight?.actual_departure ?? flight?.estimated_departure ?? flight?.scheduled_departure ?? null;
    return { leg, statusLabel, eta, dep, transitLine };
  }, [flight, guestLandedAt, guestReadyAt, collectedAt, intlFlightNumber]);

  if (!pickupId) return null;

  return (
    <GroundRadar
      intlFlight={intlFlightNumber ?? null}
      finalFlight={finalFlightNumber ?? flight?.flight_number ?? null}
      leg={view.leg}
      statusLabel={view.statusLabel}
      etaLabel={view.eta ? formatCampLabeled(view.eta) : null}
      departLabel={view.dep ? `${flight?.departure_iata ? flight.departure_iata + " · " : ""}${formatCampLabeled(view.dep)}` : null}
      schedArrivalLabel={flight?.scheduled_arrival ? formatCampLabeled(flight.scheduled_arrival) : null}
      updatedLabel={flight?.last_checked_at ? `Live · checked ${formatDistanceToNow(new Date(flight.last_checked_at), { addSuffix: true })}` : null}
      delayMinutes={flight?.delay_minutes ?? null}
      gate={flight?.gate ?? null}
      terminal={flight?.terminal ?? null}
      transitLine={view.transitLine}
    />
  );
}

export default StaffArrivalRadar;
