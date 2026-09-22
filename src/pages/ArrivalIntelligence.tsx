/**
 * Arrival intelligence — one screen showing, per arriving stay: the travel legs
 * on file and who gave them, anything that disagrees, and the stamped sequence
 * of what actually happened.
 *
 * Read-only by design. The only action here is resolving a disagreement, which
 * is an explicit human decision. Nothing on this screen changes a booking,
 * price, room, pickup status or balance.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { ArrivalExceptionsPanel } from "@/components/front-desk/ArrivalExceptionsPanel";
import {
  useArrivalIntelBoard,
  type IntelBookingRow,
  type IntelLeg,
} from "@/hooks/useArrivalIntelBoard";
import { formatCampLabeled } from "@/lib/timezone";
import { format, parseISO } from "date-fns";
import {
  Plane, Ship, Bus, Car, Search, AlertTriangle, History, Route as RouteIcon, MapPin,
} from "lucide-react";

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

function BookingBlock({ row, onOpen }: { row: IntelBookingRow; onOpen: (id: string) => void }) {
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

export default function ArrivalIntelligence() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { data: rows, isLoading } = useArrivalIntelBoard();
  const [search, setSearch] = useState("");
  const [openBooking, setOpenBooking] = useState<string | null>(null);

  const list = useMemo(() => {
    const all = rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.guest_name.toLowerCase().includes(q) ||
        (r.unit_name ?? "").toLowerCase().includes(q) ||
        r.legs.some((l) =>
          [l.marketed_flight_number, l.operating_flight_number, l.from_code, l.to_code]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        ),
    );
  }, [rows, search]);

  const needsPerson = list.filter((r) => r.openConflicts > 0);
  const noTravel = list.filter((r) => r.legs.length === 0);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <RouteIcon className="h-5 w-5 text-primary" />
            {t("arrivalIntel.title", "Arrival intelligence")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "arrivalIntel.subtitle",
              "Every arriving guest, how they get here, what disagrees, and who said what.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("arrivalIntel.statArriving", "Arriving"), value: list.length },
            { label: t("arrivalIntel.statWaiting", "Waiting on a person"), value: needsPerson.length },
            { label: t("arrivalIntel.statNoTravel", "No travel on file"), value: noTravel.length },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <div className="text-xl font-semibold text-foreground">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("arrivalIntel.search", "Search guest, room or flight number") as string}
            className="pl-8"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : (
          <Tabs defaultValue="journeys">
            <TabsList>
              <TabsTrigger value="journeys">
                {t("arrivalIntel.tabJourneys", "Journeys")} ({list.length})
              </TabsTrigger>
              <TabsTrigger value="conflicts">
                {t("arrivalIntel.tabConflicts", "Disagreements")} ({needsPerson.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="journeys" className="mt-3 space-y-3">
              {list.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    {t("arrivalIntel.empty", "No arrivals in this window.")}
                  </CardContent>
                </Card>
              ) : (
                list.map((row) => (
                  <BookingBlock key={row.booking_id} row={row} onOpen={setOpenBooking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="conflicts" className="mt-3">
              <ArrivalExceptionsPanel onOpen={setOpenBooking} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <BookingDetailSheet
        bookingId={openBooking}
        open={!!openBooking}
        onOpenChange={(o) => !o && setOpenBooking(null)}
        isAdmin={role === "admin"}
      />
    </DashboardLayout>
  );
}
