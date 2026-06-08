/**
 * Operations Intelligence Panel — at-a-glance counters with drill-down.
 * Each tile is clickable and reveals the specific bookings (guest + unit)
 * behind the number. Zero business logic, zero mutations.
 */
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bed,
  LogIn,
  AlertCircle,
  FileWarning,
  ShieldAlert,
  Sparkles,
  Plane,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { getRequiredDocsForBooking, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/requiredDocuments";

function missingDocTypesFor(b: FrontDeskBooking): DocumentType[] {
  const required = getRequiredDocsForBooking({ checkIn: b.check_in, checkOut: b.check_out });
  const have = new Set(b.docTypes ?? []);
  return required.filter((d) => !have.has(d.type)).map((d) => d.type);
}

type PickupMap = Map<string, { status: string | null; arrival_datetime: string | null }>;

interface Props {
  sections: {
    arrivingToday: FrontDeskBooking[];
    arrivedNotCheckedIn: FrontDeskBooking[];
    currentlyStaying: FrontDeskBooking[];
    departingToday: FrontDeskBooking[];
    upcoming: FrontDeskBooking[];
  };
  todaysPickupCount: number;
  turnoverPendingCount: number;
  pickupByBooking?: PickupMap;
}

type TileKey =
  | "staying"
  | "arriving"
  | "upcoming"
  | "outstanding"
  | "missingDocs"
  | "issues"
  | "turnover"
  | "airport";

export function OperationsIntelligencePanel({
  sections,
  todaysPickupCount,
  turnoverPendingCount,
  pickupByBooking,
}: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [openTile, setOpenTile] = useState<TileKey | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const allActive = useMemo(
    () => [
      ...sections.arrivingToday,
      ...sections.arrivedNotCheckedIn,
      ...sections.currentlyStaying,
      ...sections.departingToday,
      ...sections.upcoming,
    ],
    [sections],
  );

  const outstandingList = allActive.filter((b) => b.outstanding > 0);
  const missingDocsList = allActive.filter((b) => {
    if (
      b.check_in !== today &&
      b.state !== "confirmed" &&
      b.state !== "pending_deposit" &&
      b.state !== "checked_in"
    )
      return false;
    return missingDocTypesFor(b).length > 0;
  });
  const issuesList = sections.arrivingToday.filter(
    (b) => !b.depositPaid || b.outstanding > 0 || missingDocTypesFor(b).length > 0,
  );
  const turnoverList = [
    ...sections.departingToday,
    ...sections.arrivingToday,
  ].filter((b) => b.turnover && b.turnover.status !== "completed");
  const airportList = [
    ...sections.arrivingToday,
    ...sections.arrivedNotCheckedIn,
  ].filter((b) => pickupByBooking?.has(b.id));

  const tiles: TileDef[] = [
    {
      key: "staying",
      label: "Currently Staying",
      value: sections.currentlyStaying.length,
      icon: Bed,
      tone: "green",
      dot: "🟢",
      bookings: sections.currentlyStaying,
      detail: "nightsLeft",
    },
    {
      key: "arriving",
      label: "Arriving Today",
      value: sections.arrivingToday.length,
      icon: LogIn,
      tone: "yellow",
      dot: "🟡",
      bookings: sections.arrivingToday,
      detail: "checkin",
    },
    {
      key: "upcoming",
      label: "Upcoming (7 days)",
      value: sections.upcoming.length,
      icon: CalendarClock,
      tone: "info",
      dot: "📅",
      bookings: sections.upcoming,
      detail: "checkin",
    },
    {
      key: "outstanding",
      label: "Outstanding Balances",
      value: outstandingList.length,
      icon: AlertCircle,
      tone: "orange",
      dot: "🟠",
      bookings: outstandingList,
      detail: "outstanding",
    },
    {
      key: "missingDocs",
      label: "Missing Documents",
      value: missingDocsList.length,
      icon: FileWarning,
      tone: "orange",
      dot: "🟠",
      bookings: missingDocsList,
      detail: "docs",
    },
    {
      key: "issues",
      label: "Operational Issues",
      value: issuesList.length,
      icon: ShieldAlert,
      tone: "red",
      dot: "🔴",
      bookings: issuesList,
      detail: "issues",
    },
    {
      key: "turnover",
      label: "Rooms Awaiting Turnover",
      value: turnoverPendingCount,
      icon: Sparkles,
      tone: "yellow",
      dot: "🧹",
      bookings: turnoverList,
      detail: "turnover",
    },
    {
      key: "airport",
      label: "Airport Arrivals Today",
      value: todaysPickupCount,
      icon: Plane,
      tone: "info",
      dot: "✈️",
      bookings: airportList,
      detail: "pickup",
    },
  ];

  const active = tiles.find((t) => t.key === openTile) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {tiles.map((t) => (
          <Tile key={t.key} tile={t} onClick={() => setOpenTile(t.key)} />
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setOpenTile(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {active && <active.icon className="h-5 w-5" />}
              {active?.label}
              <Badge variant="outline" className="ml-1">
                {active?.bookings.length ?? 0}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Tap any guest to open their full booking.
            </DialogDescription>
          </DialogHeader>
          <DrillDownList
            tile={active}
            pickupByBooking={pickupByBooking}
            onOpen={(id) => {
              setOpenTile(null);
              setDetailId(id);
            }}
          />
        </DialogContent>
      </Dialog>

      <BookingDetailSheet
        bookingId={detailId}
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        isAdmin={false}
      />
    </>
  );
}

type Tone = "green" | "yellow" | "orange" | "red" | "info";
type DetailKind =
  | "nightsLeft"
  | "checkin"
  | "outstanding"
  | "docs"
  | "issues"
  | "turnover"
  | "pickup";

interface TileDef {
  key: TileKey;
  label: string;
  value: number;
  icon: any;
  tone: Tone;
  dot: string;
  bookings: FrontDeskBooking[];
  detail: DetailKind;
}

const TONE: Record<Tone, { bg: string; ring: string; fg: string; iconFg: string }> = {
  green: {
    bg: "bg-success/10",
    ring: "ring-[hsl(var(--success))]/25",
    fg: "text-[hsl(var(--success))]",
    iconFg: "text-[hsl(var(--success))]",
  },
  yellow: {
    bg: "bg-warning/10",
    ring: "ring-warning/30",
    fg: "text-foreground",
    iconFg: "text-warning",
  },
  orange: {
    bg: "bg-warning/20",
    ring: "ring-warning/50",
    fg: "text-foreground",
    iconFg: "text-warning",
  },
  red: {
    bg: "bg-destructive/10",
    ring: "ring-destructive/30",
    fg: "text-destructive",
    iconFg: "text-destructive",
  },
  info: {
    bg: "bg-info/10",
    ring: "ring-[hsl(var(--info))]/30",
    fg: "text-foreground",
    iconFg: "text-[hsl(var(--info))]",
  },
};

function Tile({ tile, onClick }: { tile: TileDef; onClick: () => void }) {
  const t = TONE[tile.tone];
  const dim = tile.value === 0;
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dim}
      className={`text-left ${dim ? "cursor-default" : "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"} transition-transform`}
    >
      <Card
        className={`${t.bg} ring-1 ${t.ring} border-0 ${dim ? "opacity-60" : "hover:ring-2"} transition-all`}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`text-2xl font-bold leading-none ${t.fg}`}>{tile.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1.5 leading-tight">
                <span className="mr-1">{tile.dot}</span>
                {tile.label}
              </div>
            </div>
            <Icon className={`h-4 w-4 ${t.iconFg} shrink-0`} />
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function DrillDownList({
  tile,
  pickupByBooking,
  onOpen,
}: {
  tile: TileDef | null;
  pickupByBooking?: PickupMap;
  onOpen: (id: string) => void;
}) {
  if (!tile) return null;
  if (tile.bookings.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Nothing to show here right now.
      </div>
    );
  }
  return (
    <div className="space-y-2 mt-2">
      {tile.bookings.map((b) => (
        <DrillRow
          key={b.id}
          booking={b}
          detail={tile.detail}
          pickup={pickupByBooking?.get(b.id) ?? null}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function DrillRow({
  booking,
  detail,
  pickup,
  onOpen,
}: {
  booking: FrontDeskBooking;
  detail: DetailKind;
  pickup: { status: string | null; arrival_datetime: string | null } | null;
  onOpen: (id: string) => void;
}) {
  const guest = booking.profiles?.full_name ?? "Guest";
  const unit = booking.units?.name ?? "—";

  let line: React.ReactNode = null;
  switch (detail) {
    case "nightsLeft": {
      const nightsLeft = Math.max(
        0,
        differenceInCalendarDays(parseISO(booking.check_out), new Date()),
      );
      line = (
        <>
          Checks out {format(parseISO(booking.check_out), "MMM d")} ·{" "}
          <span className="text-foreground">{nightsLeft} night{nightsLeft === 1 ? "" : "s"} left</span>
        </>
      );
      break;
    }
    case "checkin":
      line = (
        <>
          Arriving {format(parseISO(booking.check_in), "MMM d")} ·{" "}
          {booking.num_guests} guest{booking.num_guests > 1 ? "s" : ""}
          {booking.arrival_note ? ` · ${booking.arrival_note}` : ""}
        </>
      );
      break;
    case "outstanding":
      line = (
        <span className="text-destructive font-medium">
          {formatPrice(booking.outstanding)} owed
        </span>
      );
      break;
    case "docs": {
      const missing = missingDocTypesFor(booking);
      line =
        missing.length > 0 ? (
          <span className="text-warning-foreground">
            Missing: {missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(" · ")}
          </span>
        ) : (
          <span className="text-muted-foreground">All tracked docs on file</span>
        );
      break;
    }
    case "issues": {
      const flags: string[] = [];
      if (!booking.depositPaid) flags.push("Deposit unpaid");
      if (booking.outstanding > 0) flags.push(`${formatPrice(booking.outstanding)} owed`);
      const missingDocs = missingDocTypesFor(booking);
      if (missingDocs.length > 0)
        flags.push(`${missingDocs.map((t) => DOCUMENT_TYPE_LABELS[t]).join("/")} missing`);
      line = <span className="text-destructive">{flags.join(" · ")}</span>;
      break;
    }
    case "turnover":
      line = (
        <>
          Turnover: <span className="text-warning-foreground">{booking.turnover?.status ?? "pending"}</span>
          {" · "}Departs {format(parseISO(booking.check_out), "MMM d")}
        </>
      );
      break;
    case "pickup":
      line = (
        <>
          {pickup?.arrival_datetime
            ? `Arrival ${format(parseISO(pickup.arrival_datetime), "MMM d, HH:mm")}`
            : "Pickup scheduled"}
          {pickup?.status ? ` · ${pickup.status}` : ""}
        </>
      );
      break;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(booking.id)}
      className="w-full text-left rounded-md border border-border/60 hover:border-primary/60 hover:bg-muted/40 transition-colors p-3 group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">{guest}</span>
            <Badge variant="outline" className="text-[10px]">{unit}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{line}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
      </div>
    </button>
  );
}
