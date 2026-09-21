import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { useArrivalsBoard, type ArrivalsBoardRow } from "@/hooks/useArrivalsBoard";
import { STATE_LABELS, STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { formatPrice } from "@/lib/currency";
import { formatCampLabeled } from "@/lib/timezone";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import {
  LayoutDashboard, Plane, MessageSquare, RefreshCcw, Search, PlaneLanding, Car, MapPin, Clock,
} from "lucide-react";

const FLIGHT_TONE: Record<string, string> = {
  landed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  active: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  scheduled: "bg-muted text-muted-foreground",
  delayed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled: "bg-destructive/10 text-destructive",
};

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
  const canCollect = !!row.pickup && !row.pickup.collected_at && (!!row.pickup.guest_ready_at || !!row.pickup.guest_landed_at);
  return (
    <button
      onClick={() => onOpen(row.booking_id)}
      className="w-full text-left rounded-lg border border-border bg-card p-3 transition-transform duration-300 hover:-translate-y-1 hover:border-primary/40"
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
        {row.flight?.flight_number && (
          <Badge className={`text-[10px] font-mono gap-1 ${flightTone}`}>
            <Plane className="h-3 w-3" /> {row.flight.flight_number}
            {row.flight.flight_status ? ` · ${row.flight.flight_status}` : ""}
            {row.flight.delay_minutes ? ` +${row.flight.delay_minutes}m` : ""}
          </Badge>
        )}
        {row.pickup?.guest_landed_at && (
          <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <PlaneLanding className="h-3 w-3" /> Landed {formatCampLabeled(row.pickup.guest_landed_at)}
          </Badge>
        )}
        {row.pickup && !row.pickup.driver_name && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Car className="h-3 w-3" /> No driver yet
          </Badge>
        )}
        {row.pickup?.driver_name && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Car className="h-3 w-3" /> {row.pickup.driver_name}
            {row.pickup.license_plate ? ` · ${row.pickup.license_plate}` : ""}
          </Badge>
        )}
        {row.pickup?.confirmed_airport && (
          <Badge variant="outline" className="text-[10px] gap-1 uppercase">
            <MapPin className="h-3 w-3" /> {row.pickup.confirmed_airport}
          </Badge>
        )}
        {row.total_price != null && (
          <Badge variant="outline" className="text-[10px]">{formatPrice(row.total_price)}</Badge>
        )}
      </div>

      {row.last_message && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/50 p-2">
          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[11px] text-foreground line-clamp-2">
              {row.last_message.from_guest ? "Guest: " : "Team: "}
              {row.last_message.content}
            </p>
            <p className="text-[10px] text-muted-foreground">{formatCampLabeled(row.last_message.created_at)}</p>
          </div>
        </div>
      )}
    </button>
  );
}

export default function ArrivalsBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data, isLoading, refetch, isFetching } = useArrivalsBoard();
  const [search, setSearch] = useState("");
  const [openBooking, setOpenBooking] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.guest_name.toLowerCase().includes(q) ||
        (r.unit_name ?? "").toLowerCase().includes(q) ||
        (r.flight?.flight_number ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const flights = rows.filter((r) => r.flight || r.pickup);
  const talking = rows.filter((r) => r.last_message);
  const landedToday = rows.filter((r) => r.pickup?.guest_landed_at).length;
  const arrivingToday = rows.filter((r) => isToday(parseISO(r.check_in))).length;

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
            { label: t("arrivalsBoard.inWindow", "In window"), value: rows.length, icon: LayoutDashboard },
            { label: t("arrivalsBoard.arrivingToday", "Arriving today"), value: arrivingToday, icon: Clock },
            { label: t("arrivalsBoard.tracked", "Flights tracked"), value: flights.length, icon: Plane },
            { label: t("arrivalsBoard.landed", "Landed"), value: landedToday, icon: PlaneLanding },
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
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">{t("arrivalsBoard.tabAll", "All bookings")} ({rows.length})</TabsTrigger>
              <TabsTrigger value="flights">{t("arrivalsBoard.tabFlights", "Flights")} ({flights.length})</TabsTrigger>
              <TabsTrigger value="messages">{t("arrivalsBoard.tabMessages", "Conversations")} ({talking.length})</TabsTrigger>
            </TabsList>

            {([["all", rows], ["flights", flights], ["messages", talking]] as const).map(([key, list]) => (
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
