/**
 * Operational Alerts — risk roll-up for today.
 * Pure derived view from already-loaded bookings. No new queries here.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { format } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

interface AlertItem {
  bookingId: string;
  guestName: string;
  unitName: string;
  severity: "red" | "orange" | "yellow";
  reason: string;
}

interface Props {
  sections: {
    arrivingToday: FrontDeskBooking[];
    arrivedNotCheckedIn: FrontDeskBooking[];
    currentlyStaying: FrontDeskBooking[];
    departingToday: FrontDeskBooking[];
  };
  onOpen: (bookingId: string) => void;
}

export function OperationalAlerts({ sections, onOpen }: Props) {
  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];
    const today = format(new Date(), "yyyy-MM-dd");

    const push = (b: FrontDeskBooking, severity: AlertItem["severity"], reason: string) => {
      out.push({
        bookingId: b.id,
        guestName: resolveGuestDisplayName(b as any),
        unitName: b.units?.name ?? "—",
        severity,
        reason,
      });
    };

    for (const b of sections.arrivingToday) {
      const moneyMuted = isMoneyGapMuted(b);
      const docsMuted = isAcknowledged(b, "id_document");
      if (!b.depositPaid && !moneyMuted)
        push(b, "red", "Arriving today · deposit not recorded");
      if (b.outstanding > 0 && !moneyMuted)
        push(b, "orange", `Arriving today · ${formatPrice(b.outstanding)} owed`);
      if (b.docCount === 0 && !docsMuted)
        push(b, "orange", "Arriving today · no ID on file");
      if (b.turnover && b.turnover.status !== "completed")
        push(b, "orange", "Arriving today · room not cleaned yet");
    }

    for (const b of sections.arrivedNotCheckedIn) {
      const moneyMuted = isMoneyGapMuted(b);
      if (b.outstanding > 0 && !moneyMuted)
        push(b, "orange", `Arrived · ${formatPrice(b.outstanding)} owed before check-in`);
      if (b.docCount === 0 && !isAcknowledged(b, "id_document"))
        push(b, "orange", "Arrived · no ID on file yet");
    }


    for (const b of sections.departingToday) {
      if (b.outstanding > 0)
        push(b, "red", `Departing today · ${formatPrice(b.outstanding)} unresolved`);
    }

    for (const b of sections.currentlyStaying) {
      if (b.check_out === today && b.outstanding > 0)
        push(b, "red", `Checking out · ${formatPrice(b.outstanding)} unresolved`);
    }

    // Severity sort: red > orange > yellow
    const rank = { red: 0, orange: 1, yellow: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [sections]);

  if (alerts.length === 0) {
    return (
      <Card className="border-[hsl(var(--success))]/30 bg-success/5">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
          <div className="text-sm text-muted-foreground">
            No operational issues. All today's arrivals and departures look clean.
          </div>
        </CardContent>
      </Card>
    );
  }

  const toneClass = (s: AlertItem["severity"]) =>
    s === "red"
      ? "border-l-destructive bg-destructive/5"
      : s === "orange"
        ? "border-l-warning bg-warning/5"
        : "border-l-warning/60 bg-warning/5";

  const badgeClass = (s: AlertItem["severity"]) =>
    s === "red"
      ? "bg-destructive/15 text-destructive border-destructive/40"
      : "bg-warning/20 text-warning-foreground border-warning/50";

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">
            Operational Alerts
          </h3>
          <Badge variant="outline" className="ml-1 text-[10px]">
            {alerts.length}
          </Badge>
        </div>
        <div className="divide-y">
          {alerts.map((a, i) => (
            <button
              key={`${a.bookingId}-${i}`}
              onClick={() => onOpen(a.bookingId)}
              className={`w-full text-left px-4 py-2.5 border-l-4 ${toneClass(a.severity)} hover:bg-accent/40 transition-colors flex items-center gap-3`}
            >
              <Badge variant="outline" className={`text-[10px] ${badgeClass(a.severity)}`}>
                {a.severity === "red" ? "Critical" : "Warning"}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">
                  {a.guestName} <span className="text-muted-foreground">· {a.unitName}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{a.reason}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
