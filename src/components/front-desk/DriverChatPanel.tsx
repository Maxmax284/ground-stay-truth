import { useState } from "react";
import { Car, Link2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PickupConversationDialog } from "@/components/PickupConversationDialog";
import { useCreateDriverLink } from "@/hooks/useDriverLink";
import { useTodaysPickups } from "@/hooks/useAirportPickups";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { toast } from "sonner";

export function DriverChatPanel() {
  const { data: pickups, isLoading } = useTodaysPickups();
  const createLink = useCreateDriverLink();
  const [active, setActive] = useState<{ id: string; guestName: string } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const copyLink = async (pickupId: string) => {
    setLinking(pickupId);
    try {
      const { url } = await createLink.mutateAsync({ pickup_id: pickupId });
      await navigator.clipboard.writeText(url);
      toast.success("Driver link copied — send it by WhatsApp or LINE.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not make driver link.");
    } finally {
      setLinking(null);
    }
  };

  if (isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" /> Driver links & chats
          <Badge variant="secondary" className="ml-auto">Today</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!pickups?.length ? (
          <p className="py-3 text-sm text-muted-foreground">No active pickups today.</p>
        ) : pickups.map((pickup: any) => {
          const guestName = resolveGuestDisplayName(pickup.bookings ?? {});
          return (
            <div key={pickup.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <Car className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{guestName}</p>
                <p className="truncate text-xs text-muted-foreground">{pickup.drivers?.name ?? "Driver not assigned"}{pickup.flight_number ? ` · ${pickup.flight_number}` : ""}</p>
              </div>
              <Button variant="outline" size="sm" disabled={linking === pickup.id} onClick={() => void copyLink(pickup.id)}>
                <Link2 className="mr-2 h-4 w-4" /> {linking === pickup.id ? "Making…" : "Copy link"}
              </Button>
              <Button size="sm" onClick={() => setActive({ id: pickup.id, guestName })}>
                <MessageSquare className="mr-2 h-4 w-4" /> Open chat
              </Button>
            </div>
          );
        })}
      </CardContent>
      <PickupConversationDialog pickupId={active?.id ?? null} guestName={active?.guestName} open={!!active} onOpenChange={(open) => !open && setActive(null)} />
    </Card>
  );
}
