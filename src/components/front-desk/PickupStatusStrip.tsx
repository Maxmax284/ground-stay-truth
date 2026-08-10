/**
 * Pickup Status Strip — read-only view of today's airport pickups.
 * Surfaces existing airport_pickups rows. No mutations, no new workflows.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plane, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { formatCampLabeled } from "@/lib/timezone";

type PickupMap = Map<string, { status: string | null; arrival_datetime: string | null }>;

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  en_route: "bg-info/20 text-[hsl(var(--info))]",
  arrived: "bg-success/15 text-[hsl(var(--success))]",
  completed: "bg-success/15 text-[hsl(var(--success))]",
  cancelled: "bg-destructive/15 text-destructive",
  delayed: "bg-warning/25 text-warning-foreground",
};

interface Props {
  bookings: FrontDeskBooking[];
  pickupByBooking: PickupMap;
  onOpen: (id: string) => void;
}

export function PickupStatusStrip({ bookings, pickupByBooking, onOpen }: Props) {
  const { t } = useTranslation();
  const rows = bookings
    .map((b) => ({ b, pickup: pickupByBooking.get(b.id) }))
    .filter((r) => r.pickup && r.pickup.arrival_datetime);

  if (rows.length === 0) return null;

  rows.sort((a, b) =>
    (a.pickup!.arrival_datetime ?? "").localeCompare(b.pickup!.arrival_datetime ?? ""),
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plane className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t("frontDesk.pickups.title")}</h2>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map(({ b, pickup }) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onOpen(b.id)}
              className="text-left rounded-md border border-border/50 p-2.5 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground truncate">
                  {resolveGuestDisplayName(b as any)}
                </span>
                <Badge className={`text-[10px] ${STATUS_TONE[pickup!.status ?? "scheduled"] ?? "bg-muted text-muted-foreground"}`}>
                  {(pickup!.status ?? "scheduled").replace("_", " ")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {pickup!.arrival_datetime
                  ? formatCampLabeled(pickup!.arrival_datetime)
                  : "—"}
                <span className="ml-2">· {b.units?.name ?? "—"}</span>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
