/**
 * One arriving stay's travel story: the legs on file, who gave them, and the
 * stamped sequence of what actually happened. Read-only.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCampLabeled } from "@/lib/timezone";
import { format, parseISO } from "date-fns";
import { Plane, Ship, Bus, Car, AlertTriangle, History, MapPin } from "lucide-react";
import type { IntelBookingRow, IntelLeg } from "@/hooks/useArrivalIntelBoard";

const LEG_ICON: Record<string, typeof Plane> = {
  flight: Plane,
  ferry: Ship,
  bus: Bus,
  road: Car,
};

const SOURCE_LABEL: Record<string, string> = {
  staff_entered: "your team",
  guest_stated: "the guest",
  guest_reported: "the guest",
  evidence_extracted: "their upload",
  provider: "the airline feed",
  inferred: "a best guess",
};

const STAGE_LABEL: Record<string, string> = {
  self_reported_landed: "Guest said their plane landed",
  ready_for_pickup: "Guest said they are out with bags",
  collected: "Staff marked the guest collected",
};

function legTitle(leg: IntelLeg) {
  const num = leg.operating_flight_number || leg.marketed_flight_number;
  const route = [leg.from_code, leg.to_code].filter(Boolean).join(" → ");
  if (num && route) return `${num} · ${route}`;
  return num || route || "Travel leg";
}

function LegLine({ leg }: { leg: IntelLeg }) {
  const Icon = LEG_ICON[leg.leg_type ?? "flight"] ?? Plane;
  const codeshare =
    leg.marketed_flight_number &&
    leg.operating_flight_number &&
    leg.marketed_flight_number !== leg.operating_flight_number;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border p-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {legTitle(leg)}
          {leg.is_final_leg && (
            <span className="ml-1.5 text-[10px] font-normal text-primary">we meet them here</span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {leg.scheduled_arrival ? `Arrives ${formatCampLabeled(leg.scheduled_arrival)}` : "No arrival time on file"}
          {" · from "}
          {SOURCE_LABEL[leg.source ?? ""] ?? "an unknown source"}
          {codeshare && ` · sold as ${leg.marketed_flight_number}, flown by ${leg.operating_carrier ?? leg.operating_flight_number}`}
        </p>
      </div>
    </div>
  );
}

export function JourneyBlock({ row, onOpen }: { row: IntelBookingRow; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const stages = [...row.stages].reverse();
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{row.guest_name}</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {row.unit_name ?? t("arrivalIntel.noUnit", "No room yet")} ·{" "}
              {format(parseISO(row.check_in), "EEE d MMM")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {row.openConflicts > 0 && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                {t("arrivalIntel.waiting", "{{count}} waiting on a person", { count: row.openConflicts })}
              </Badge>
            )}
            {row.pickup?.confirmed_airport && (
              <Badge variant="outline" className="gap-1 text-[10px] uppercase">
                <MapPin className="h-3 w-3" /> {row.pickup.confirmed_airport}
              </Badge>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(row.booking_id)}>
              {t("arrivalIntel.openBooking", "Open booking")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("arrivalIntel.legs", "Travel on file")}
          </p>
          {row.legs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("arrivalIntel.noLegs", "No travel details on file yet — nobody has told us how they get here.")}
            </p>
          ) : (
            row.legs.map((leg) => <LegLine key={leg.id} leg={leg} />)
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("arrivalIntel.timeline", "What happened, in order")}
          </p>
          {stages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("arrivalIntel.noStages", "Nothing confirmed yet by the guest or your team.")}
            </p>
          ) : (
            <ul className="space-y-1">
              {stages.map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <History className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    <span className="text-foreground">{STAGE_LABEL[s.stage] ?? s.stage.replace(/_/g, " ")}</span>
                    {" — "}
                    {formatCampLabeled(s.fired_at)}
                    {s.triggered_by ? ` (${s.triggered_by})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            {t(
              "arrivalIntel.doctrine",
              "A plane landing only means the plane landed. Pickup, room and balance never move on their own.",
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
