import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTodaysPickups } from "@/hooks/useAirportPickups";
import { Plane, MessageSquare, Car } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-muted text-muted-foreground",
};

interface Props {
  onClickBooking?: (id: string) => void;
}

export function TodaysPickupsWidget({ onClickBooking }: Props) {
  const { data: pickups, isLoading } = useTodaysPickups();

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!pickups || pickups.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          Today's Pickups
          <Badge variant="secondary" className="text-xs ml-1">{pickups.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pickups.map((p: any) => {
          const guestName = p.bookings?.profiles?.full_name ?? "Guest";
          const unitName = p.bookings?.units?.name ?? "";
          const driverName = p.drivers?.name;
          const time = p.arrival_datetime
            ? new Date(p.arrival_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : null;

          const whatsappLink = p.drivers?.whatsapp
            ? `https://wa.me/${p.drivers.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Pickup update for ${guestName}`)}`
            : null;

          return (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => onClickBooking?.(p.booking_id)}
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{guestName}</span>
                  {unitName && <span className="text-xs text-muted-foreground">· {unitName}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {time && <span>🕐 {time}</span>}
                  {p.flight_number && <span>✈️ {p.flight_number}</span>}
                  {driverName && (
                    <span className="flex items-center gap-0.5"><Car className="h-3 w-3" /> {driverName}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className={STATUS_COLORS[p.status] ?? ""}>{p.status}</Badge>
                {whatsappLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => { e.stopPropagation(); window.open(whatsappLink, "_blank"); }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
