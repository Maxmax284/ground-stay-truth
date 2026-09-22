/**
 * Arrival exceptions — the only place staff resolve disagreeing travel details.
 *
 * Lives inside Front Desk on purpose: same stay, same screen, no second
 * product. Each row is one question with three human answers. Nothing here
 * changes a booking, a price, a room or a pickup status.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check, Copy, ExternalLink, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import {
  useArrivalExceptions,
  useDecideArrivalException,
  usePickupBriefs,
  type ArrivalExceptionRow,
} from "@/hooks/useArrivalExceptions";
import { buildDriverBrief } from "@/lib/driverBrief";
import { meetingPointFor } from "@/lib/meetingPoints";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { format, parseISO } from "date-fns";

/** Plain words for the machine field names. No jargon reaches the screen. */
const FIELD_LABEL: Record<string, string> = {
  marketed_flight_number: "Flight number",
  operating_flight_number: "Flight actually flown",
  operating_carrier: "Airline flying it",
  from_code: "Leaving from",
  to_code: "Arriving at",
  from_name: "Leaving from",
  to_name: "Arriving at",
  scheduled_departure: "Departure time",
  scheduled_arrival: "Arrival time",
  leg_type: "How they travel",
};

function fieldLabel(field: string) {
  return FIELD_LABEL[field] ?? field.replace(/_/g, " ");
}

function readValue(field: string, value: string | null) {
  if (!value) return "—";
  if (field.includes("departure") || field.includes("arrival")) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return format(d, "d MMM HH:mm");
  }
  return value;
}

const SOURCE_LABEL: Record<string, string> = {
  staff_entered: "your team",
  guest_stated: "the guest",
  guest_reported: "the guest",
  evidence_extracted: "their upload",
  provider: "the airline feed",
  inferred: "a best guess",
};

function sourceLabel(source: string | null) {
  return (source && SOURCE_LABEL[source]) || "an unknown source";
}

export function ArrivalExceptionsPanel({ onOpen }: { onOpen: (bookingId: string) => void }) {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useArrivalExceptions();
  const decide = useDecideArrivalException();
  const [busyId, setBusyId] = useState<string | null>(null);

  const bookingIds = useMemo(() => (rows ?? []).map((r) => r.booking_id), [rows]);
  const { data: briefs } = usePickupBriefs(bookingIds);

  const grouped = useMemo(() => {
    const map = new Map<string, ArrivalExceptionRow[]>();
    (rows ?? []).forEach((r) => {
      const list = map.get(r.booking_id) ?? [];
      list.push(r);
      map.set(r.booking_id, list);
    });
    return [...map.entries()];
  }, [rows]);

  const run = async (row: ArrivalExceptionRow, decision: Parameters<typeof decide.mutateAsync>[0]["decision"]) => {
    setBusyId(row.id);
    try {
      await decide.mutateAsync({ row, decision });
      toast.success(t("arrivalExceptions.saved", "Noted — thanks."));
    } catch (e: any) {
      toast.error(e?.message ?? t("arrivalExceptions.failed", "Could not save that."));
    } finally {
      setBusyId(null);
    }
  };

  const copyBrief = (bookingId: string, guestName: string, guestPhone: string | null) => {
    const p = briefs?.[bookingId];
    const airport = p?.confirmed_airport ?? null;
    const text = buildDriverBrief({
      guestName,
      guestPhone,
      passengerCount: p?.passenger_count ?? null,
      flightNumber: p?.flight_number ?? null,
      arrivalAirport: airport,
      arrivalDateTime: p?.arrival_datetime ?? null,
      meetingPoint: meetingPointFor(airport)?.point ?? p?.arrival_location_name ?? null,
      driverName: p?.drivers?.name ?? null,
      licensePlate: p?.drivers?.license_plate ?? null,
      luggageNotes: p?.luggage_notes ?? null,
      specialInstructions: p?.special_instructions ?? null,
      readyAt: p?.guest_ready_at ?? null,
      collectedAt: p?.collected_at ?? null,
    });
    navigator.clipboard.writeText(text);
    toast.success(t("arrivalExceptions.briefCopied", "Driver brief copied — paste it to your driver."));
  };

  if (isLoading) return <Skeleton className="h-28 w-full" />;

  if (grouped.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("arrivalExceptions.empty", "Nothing to check. Every guest's travel details agree.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map(([bookingId, list]) => {
        const b = list[0].bookings;
        const guestName = resolveGuestDisplayName({
          manual_guest_name: b?.manual_guest_name ?? null,
          profiles: b?.profiles ? { full_name: b.profiles.full_name, email: null } : null,
        } as any);
        const guestPhone = b?.profiles?.phone ?? b?.manual_guest_phone ?? null;
        return (
          <Card key={bookingId} className="transition-transform duration-300 hover:-translate-y-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {guestName}
                {b?.units?.name && <Badge variant="outline">{b.units.name}</Badge>}
                {b?.check_in && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("arrivalExceptions.arrives", "arrives")} {format(parseISO(b.check_in), "d MMM")}
                  </span>
                )}
                <span className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyBrief(bookingId, guestName, guestPhone)}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t("arrivalExceptions.copyBrief", "Copy driver brief")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(bookingId)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("arrivalExceptions.openBooking", "Open booking")}
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {list.map((row) => (
                <div key={row.id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
                    {fieldLabel(row.field_name)}
                    {row.severity === "critical" && (
                      <Badge variant="destructive" className="text-xs">
                        {t("arrivalExceptions.important", "Important")}
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded bg-muted/40 p-2 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {t("arrivalExceptions.onFile", "On file, from")} {sourceLabel(row.existing_source)}
                      </p>
                      <p className="font-mono">{readValue(row.field_name, row.existing_value)}</p>
                    </div>
                    <div className="rounded bg-muted/40 p-2 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {t("arrivalExceptions.incoming", "New reading, from")} {sourceLabel(row.incoming_source)}
                      </p>
                      <p className="font-mono">{readValue(row.field_name, row.incoming_value)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => run(row, "kept_existing")}>
                      <Check className="mr-2 h-4 w-4" />
                      {t("arrivalExceptions.keepOurs", "Keep what we have")}
                    </Button>
                    <Button size="sm" disabled={busyId === row.id || !row.leg_id} onClick={() => run(row, "accepted_incoming")}>
                      {t("arrivalExceptions.useNew", "Use the new detail")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => run(row, "not_applicable")}>
                      {t("arrivalExceptions.notRelevant", "Not relevant")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default ArrivalExceptionsPanel;
