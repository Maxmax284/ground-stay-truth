/**
 * Turnover Board — read-only view of rooms needing turnover today.
 * Sources existing housekeeping_tasks via FrontDeskBooking.turnover.
 * No mutations: housekeeping workflows live in their own module.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight } from "lucide-react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

const TONE: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  in_progress: "bg-info/20 text-[hsl(var(--info))] border-[hsl(var(--info))]/30",
  completed: "bg-success/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
};

interface Props {
  departing: FrontDeskBooking[];
  arriving: FrontDeskBooking[];
  onOpen: (id: string) => void;
}

export function TurnoverBoard({ departing, arriving, onOpen }: Props) {
  // Departures today whose turnover isn't yet completed = rooms about to flip.
  const rows = [...departing, ...arriving]
    .filter((b) => b.turnover && b.turnover.status !== "completed")
    // De-dupe by unit — show the most "actionable" one per unit
    .reduce<FrontDeskBooking[]>((acc, b) => {
      if (!acc.find((x) => x.unit_id === b.unit_id)) acc.push(b);
      return acc;
    }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Turnover Board</h2>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          <span className="text-[11px] text-muted-foreground ml-1">
            Rooms awaiting turnover today
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((b) => {
            const status = b.turnover?.status ?? "pending";
            const isDeparting = b.check_out === new Date().toISOString().slice(0, 10);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onOpen(b.id)}
                className="text-left rounded-md border border-border/50 p-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">
                    {b.units?.name ?? "—"}
                  </span>
                  <Badge className={`text-[10px] border ${TONE[status] ?? ""}`}>
                    {status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  {isDeparting ? (
                    <>
                      <span>Departing: {resolveGuestDisplayName(b as any)}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>Flip needed</span>
                    </>
                  ) : (
                    <>
                      <span>Arriving: {resolveGuestDisplayName(b as any)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
