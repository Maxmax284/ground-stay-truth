/**
 * Arrivals — one screen for everything about people getting here: who is coming,
 * what their flight is doing, the travel legs on file and what disagrees.
 *
 * Read-heavy by design. The only actions are marking a guest collected and
 * settling a disagreement — both explicit human decisions. Flight data never
 * moves a booking, price, room or pickup status on its own.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { StaffArrivalRadar } from "@/components/front-desk/StaffArrivalRadar";
import { ArrivalExceptionsPanel } from "@/components/front-desk/ArrivalExceptionsPanel";
import { DriverResponseRateStrip } from "@/components/front-desk/DriverResponseRateStrip";
import { ArrivalEssentialsPanel } from "@/components/front-desk/ArrivalEssentialsPanel";
import { JourneyBlock } from "@/components/front-desk/JourneyBlock";
import { GuestThreadLauncher } from "@/components/GuestThreadLauncher";
import { useArrivalsBoard, type ArrivalsBoardRow } from "@/hooks/useArrivalsBoard";
import { useArrivalIntelBoard } from "@/hooks/useArrivalIntelBoard";
import { useArrivalProgress } from "@/hooks/useArrivalProgress";
import { toast } from "sonner";
import { STATE_LABELS, STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { formatPrice } from "@/lib/currency";
import { formatCampLabeled } from "@/lib/timezone";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import {
  LayoutDashboard, Plane, MessageSquare, RefreshCcw, Search, PlaneLanding, Car, MapPin, Clock,
  AlertTriangle, Home,
} from "lucide-react";

const FLIGHT_TONE: Record<string, string> = {
  landed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  active: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  scheduled: "bg-muted text-muted-foreground",
  delayed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled: "bg-destructive/10 text-destructive",
};

/** States where the guest is already here — nothing about the flight matters any more. */
const SETTLED_STATES = new Set(["checked_in", "completed", "no_show", "cancelled"]);

/** The arrival is still in play: the guest is not here yet and the car has not taken them. */
function isArrivalLive(row: ArrivalsBoardRow) {
  if (SETTLED_STATES.has(row.state)) return false;
  if (!row.pickup) return false;
  if (row.pickup.collected_at) return false;
  if (row.pickup.status === "completed" || row.pickup.status === "cancelled") return false;
  return true;
}

function dayLabel(date: string) {
  const d = parseISO(date);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE d MMM");
}

function RowCard({ row, onOpen }: { row: ArrivalsBoardRow; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const flightTone = row.flight?.flight_status ? FLIGHT_TONE[row.flight.flight_status] ?? FLIGHT_TONE.scheduled : null;
  const progress = useArrivalProgress();
  const live = isArrivalLive(row);
  const inHouse = row.state === "checked_in";
  const canCollect = live && (!!row.pickup?.guest_ready_at || !!row.pickup?.guest_landed_at);
  // Live scope only while the arrival is still in play — guests already here don't need it.
  const showRadar = live && !!row.flight?.flight_number;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.booking_id)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(row.booking_id); }}
      className="w-full cursor-pointer text-left rounded-lg border border-border bg-card p-3 transition-transform duration-300 hover:-translate-y-1 hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{row.guest_name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {row.unit_name ?? "No unit"} · {dayLabel(row.check_in)} → {format(parseISO(row.check_out), "d MMM")}
          </p>
        </div>
        <Badge variant="secondary" className={`text-[10px] shrink-0 ${STATE_VARIANTS[row.state as BookingState] ?? ""}`}>
          {STATE_LABELS[row.state as BookingState] ?? row.state}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {inHouse && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Home className="h-3 w-3" /> {t("arrivalsBoard.inHouseBadge", "Here now")}
          </Badge>
        )}
        {row.flight?.flight_number && !inHouse && (
          <Badge className={`text-[10px] font-mono gap-1 ${flightTone}`}>
            <Plane className="h-3 w-3" /> {row.flight.flight_number}
            {row.flight.flight_status ? ` · ${row.flight.flight_status}` : ""}
            {row.flight.delay_minutes ? ` +${row.flight.delay_minutes}m` : ""}
          </Badge>
        )}
        {row.pickup?.guest_landed_at && live && (
          <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <PlaneLanding className="h-3 w-3" /> {t("arrivalsBoard.landedAt", "Landed")} {formatCampLabeled(row.pickup.guest_landed_at)}
          </Badge>
        )}
        {row.pickup?.guest_ready_at && live && (
          <Badge className="text-[10px] gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {t("arrivalsBoard.readyBadge", "Ready for pickup")}
          </Badge>
        )}
        {row.pickup?.collected_at && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            {t("arrivalsBoard.collectedBadge", "Collected")}
          </Badge>
        )}
        {live && !row.pickup?.driver_name && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Car className="h-3 w-3" /> {t("arrivalsBoard.noDriver", "No driver yet")}
          </Badge>
        )}
        {row.pickup?.driver_name && live && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Car className="h-3 w-3" /> {row.pickup.driver_name}
            {row.pickup.license_plate ? ` · ${row.pickup.license_plate}` : ""}
          </Badge>
        )}
        {row.pickup?.confirmed_airport && live && (
          <Badge variant="outline" className="text-[10px] gap-1 uppercase">
            <MapPin className="h-3 w-3" /> {row.pickup.confirmed_airport}
          </Badge>
        )}
        {row.total_price != null && (
          <Badge variant="outline" className="text-[10px]">{formatPrice(row.total_price)}</Badge>
        )}
      </div>

      {showRadar && row.pickup && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <StaffArrivalRadar
            pickupId={row.pickup.id}
            finalFlightNumber={row.flight?.flight_number ?? null}
            guestLandedAt={row.pickup.guest_landed_at}
            guestReadyAt={row.pickup.guest_ready_at}
            collectedAt={row.pickup.collected_at}
          />
        </div>
      )}

      {/* The last thing said, and a tap straight into that guest's own thread. */}
      {row.last_message && (
        <GuestThreadLauncher
          bookingId={row.booking_id}
          guestName={row.guest_name}
          headline={row.unit_name ?? row.guest_name}
          className="mt-2 cursor-pointer rounded-md bg-muted/50 p-2 transition-colors hover:bg-muted"
          trigger={
            <div className="flex items-start gap-1.5">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[11px] text-foreground line-clamp-2">
                  {row.last_message.from_guest ? "Guest: " : "Team: "}
                  {row.last_message.content}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatCampLabeled(row.last_message.created_at)}</p>
              </div>
            </div>
          }
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <GuestThreadLauncher
          bookingId={row.booking_id}
          guestName={row.guest_name}
          headline={row.unit_name ?? row.guest_name}
          onOpenBooking={() => onOpen(row.booking_id)}
        />
      </div>

      {canCollect && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-8 text-xs"
          disabled={progress.isPending}
          onClick={(e) => {
            e.stopPropagation();
            progress.mutate(
              { bookingId: row.booking_id, action: "collected" },
              {
                onSuccess: () => toast.success(t("arrivalsBoard.collectedDone", "Marked collected.")),
                onError: (err: any) => toast.error(err?.message ?? t("common.error", "Something went wrong")),
              },
            );
          }}
        >
          {t("arrivalsBoard.markCollected", "Collected")}
        </Button>
      )}
    </div>
  );
}

export default function ArrivalsBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data, isLoading, refetch, isFetching } = useArrivalsBoard();
  const canSeeIntel = role === "admin" || role === "manager" || role === "front_desk_supervisor";
  const { data: intelRows, isLoading: intelLoading } = useArrivalIntelBoard();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "incoming");
  const [search, setSearch] = useState("");
  const [openBooking, setOpenBooking] = useState<string | null>(null);

  const q = search.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.guest_name.toLowerCase().includes(q) ||
        (r.unit_name ?? "").toLowerCase().includes(q) ||
        (r.flight?.flight_number ?? "").toLowerCase().includes(q)
    );
  }, [data, q]);

  const journeys = useMemo(() => {
    const all = canSeeIntel ? intelRows ?? [] : [];
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
  }, [intelRows, q, canSeeIntel]);

  const incoming = rows.filter((r) => !SETTLED_STATES.has(r.state));
  const inHouse = rows.filter((r) => r.state === "checked_in");
  const liveFlights = rows.filter(isArrivalLive);
  const talking = rows.filter((r) => r.last_message);
  const waiting = journeys.reduce((n, r) => n + r.openConflicts, 0);
  const arrivingToday = incoming.filter((r) => isToday(parseISO(r.check_in))).length;

  return (
    <DashboardLayout>
      <div className="space-y-5" data-ai-focus="arrivals-board">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              {t("arrivalsBoard.title", "Arrivals Board")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("arrivalsBoard.subtitle", "Every booking coming in, its flight, and the last thing the guest said.")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {t("common.refresh", "Refresh")}
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t("arrivalsBoard.arrivingToday", "Arriving today"), value: arrivingToday, icon: Clock },
            { label: t("arrivalsBoard.liveFlights", "Flights in the air"), value: liveFlights.length, icon: Plane },
            { label: t("arrivalsBoard.inHouseStat", "Here now"), value: inHouse.length, icon: Home },
            { label: t("arrivalsBoard.waitingStat", "Waiting on a person"), value: waiting, icon: AlertTriangle },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 flex items-center gap-2.5">
                <s.icon className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-xl font-bold text-foreground">{s.value}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DriverResponseRateStrip />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("arrivalsBoard.search", "Search guest, unit or flight number") as string}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="incoming">{t("arrivalsBoard.tabIncoming", "Coming in")} ({incoming.length})</TabsTrigger>
              <TabsTrigger value="inhouse">{t("arrivalsBoard.tabInHouse", "Here now")} ({inHouse.length})</TabsTrigger>
              <TabsTrigger value="messages">{t("arrivalsBoard.tabMessages", "Conversations")} ({talking.length})</TabsTrigger>
              {canSeeIntel && (
                <>
                  <TabsTrigger value="journeys">{t("arrivalIntel.tabJourneys", "Journeys")} ({journeys.length})</TabsTrigger>
                  <TabsTrigger value="conflicts">{t("arrivalIntel.tabConflicts", "Disagreements")} ({waiting})</TabsTrigger>
                </>
              )}
              <TabsTrigger value="guide">{t("arrivalsBoard.tabGuide", "Island guide")}</TabsTrigger>
            </TabsList>

            {([["incoming", incoming], ["inhouse", inHouse], ["messages", talking]] as const).map(([key, list]) => (
              <TabsContent key={key} value={key} className="mt-3">
                {list.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">
                      {t("arrivalsBoard.empty", "Nothing here right now.")}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {list.map((row) => (
                      <RowCard key={row.booking_id} row={row} onOpen={setOpenBooking} />
                    ))}
                  </div>
                )}
                {key === "messages" && list.length > 0 && (
                  <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => navigate("/messages")}>
                    {t("arrivalsBoard.openMessages", "Open the full message inbox")}
                  </Button>
                )}
              </TabsContent>
            ))}

            {canSeeIntel && (
              <>
                <TabsContent value="journeys" className="mt-3 space-y-3">
                  {intelLoading ? (
                    <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
                  ) : journeys.length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-center text-sm text-muted-foreground">
                        {t("arrivalIntel.empty", "No arrivals in this window.")}
                      </CardContent>
                    </Card>
                  ) : (
                    journeys.map((row) => (
                      <JourneyBlock key={row.booking_id} row={row} onOpen={setOpenBooking} />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="conflicts" className="mt-3">
                  <ArrivalExceptionsPanel onOpen={setOpenBooking} />
                </TabsContent>
              </>
            )}

            {/* What the camp recommends, and which places arriving guests see first. */}
            <TabsContent value="guide" className="mt-3">
              <ArrivalEssentialsPanel />
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
