/**
 * Operations Intelligence Panel — read-only at-a-glance counters.
 * Derives every number from data already loaded by useFrontDeskData +
 * a small read-only pickup query. Zero business logic, zero mutations.
 */
import { Card, CardContent } from "@/components/ui/card";
import {
  Bed,
  LogIn,
  Clock,
  AlertCircle,
  FileWarning,
  ShieldAlert,
  Sparkles,
  Plane,
} from "lucide-react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { format } from "date-fns";

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
}

export function OperationsIntelligencePanel({
  sections,
  todaysPickupCount,
  turnoverPendingCount,
}: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const allActive = [
    ...sections.arrivingToday,
    ...sections.arrivedNotCheckedIn,
    ...sections.currentlyStaying,
    ...sections.departingToday,
    ...sections.upcoming,
  ];

  const outstandingCount = allActive.filter((b) => b.outstanding > 0).length;
  const missingDocsCount = allActive.filter(
    (b) =>
      b.docCount === 0 &&
      (b.check_in === today ||
        b.state === "confirmed" ||
        b.state === "pending_deposit"),
  ).length;

  // Operational issues = arriving today with hard problems
  const issuesCount = sections.arrivingToday.filter(
    (b) => !b.depositPaid || b.outstanding > 0 || b.docCount === 0,
  ).length;

  const tiles: TileDef[] = [
    {
      label: "Currently Staying",
      value: sections.currentlyStaying.length,
      icon: Bed,
      tone: "green",
      dot: "🟢",
    },
    {
      label: "Arriving Today",
      value: sections.arrivingToday.length,
      icon: LogIn,
      tone: "yellow",
      dot: "🟡",
    },
    {
      label: "Arrived — Waiting",
      value: sections.arrivedNotCheckedIn.length,
      icon: Clock,
      tone: "yellow",
      dot: "🟡",
    },
    {
      label: "Outstanding Balances",
      value: outstandingCount,
      icon: AlertCircle,
      tone: "orange",
      dot: "🟠",
    },
    {
      label: "Missing Documents",
      value: missingDocsCount,
      icon: FileWarning,
      tone: "orange",
      dot: "🟠",
    },
    {
      label: "Operational Issues",
      value: issuesCount,
      icon: ShieldAlert,
      tone: "red",
      dot: "🔴",
    },
    {
      label: "Rooms Awaiting Turnover",
      value: turnoverPendingCount,
      icon: Sparkles,
      tone: "yellow",
      dot: "🧹",
    },
    {
      label: "Airport Arrivals Today",
      value: todaysPickupCount,
      icon: Plane,
      tone: "info",
      dot: "✈️",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {tiles.map((t) => (
        <Tile key={t.label} {...t} />
      ))}
    </div>
  );
}

type Tone = "green" | "yellow" | "orange" | "red" | "info";
interface TileDef {
  label: string;
  value: number;
  icon: any;
  tone: Tone;
  dot: string;
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

function Tile({ label, value, icon: Icon, tone, dot }: TileDef) {
  const t = TONE[tone];
  const dim = value === 0;
  return (
    <Card
      className={`${t.bg} ring-1 ${t.ring} border-0 ${dim ? "opacity-60" : ""} transition-opacity`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`text-2xl font-bold leading-none ${t.fg}`}>{value}</div>
            <div className="text-[11px] text-muted-foreground mt-1.5 leading-tight">
              <span className="mr-1">{dot}</span>
              {label}
            </div>
          </div>
          <Icon className={`h-4 w-4 ${t.iconFg} shrink-0`} />
        </div>
      </CardContent>
    </Card>
  );
}
