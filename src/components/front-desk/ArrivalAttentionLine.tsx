/**
 * One quiet staff-only line: what needs a person's attention on this arrival,
 * and where the details came from. Read-only — it never changes a booking,
 * price, room, pickup status or payment. Nothing here auto-applies.
 */
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { useArrivalIntelligence } from "@/hooks/useArrivalIntelligence";
import { describeCarrier } from "@/lib/arrivalIntelligence";

interface Props {
  bookingId: string;
  pickupAirportCode?: string | null;
  pickupArrivalTime?: string | null;
  pickupRequested?: boolean;
  driverAssigned?: boolean;
  guestLandedAt?: string | null;
  guestReadyAt?: string | null;
  collectedAt?: string | null;
  checkedIn?: boolean;
}

const ICON = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE = {
  critical: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
} as const;

export function ArrivalAttentionLine(props: Props) {
  const { situation, legs, isLoading } = useArrivalIntelligence(props.bookingId, {
    guestLandedAt: props.guestLandedAt ?? null,
    guestReadyAt: props.guestReadyAt ?? null,
    collectedAt: props.collectedAt ?? null,
    checkedIn: props.checkedIn ?? false,
    pickupRequested: props.pickupRequested ?? false,
    driverAssigned: props.driverAssigned ?? false,
    pickupAirportCode: props.pickupAirportCode ?? null,
    pickupArrivalTime: props.pickupArrivalTime ?? null,
  });

  if (isLoading || !situation) return null;
  if (!legs.length && situation.attention.length === 0) return null;

  const desk = situation.views.front_desk;
  const fact = situation.finalFact;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-1">
      <p className="text-xs font-medium">{desk.headline}</p>
      {situation.attention.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Travel details agree. Nothing to check.</p>
      ) : (
        <ul className="space-y-0.5">
          {situation.attention.map((check) => {
            const Icon = ICON[check.severity];
            return (
              <li key={check.code} className={`flex items-start gap-1 text-[11px] ${TONE[check.severity]}`}>
                <Icon className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{check.message}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground">
        {legs.length
          ? `${legs.length} leg${legs.length === 1 ? "" : "s"} on file · from ${situation.finalLeg?.source?.replace(/_/g, " ") ?? "unknown"}`
          : "No legs on file"}
        {fact ? ` · ${describeCarrier(fact)}` : ""}
        {situation.dataIsStale ? " · flight data stale" : ""}
      </p>
    </div>
  );
}

export default ArrivalAttentionLine;
