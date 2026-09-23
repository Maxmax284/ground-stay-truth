import { formatDistanceToNow } from "date-fns";
import { Eye, EyeOff, MessageSquare } from "lucide-react";
import { usePickupDriverResponse } from "@/hooks/useDriverResponseRate";

/** Plain status of the driver link for one pickup: sent, opened, or answered. */
export function DriverResponseLine({ pickupId }: { pickupId: string }) {
  const { data } = usePickupDriverResponse(pickupId);
  if (!data || data.state === "no_link") return null;

  const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "");

  if (data.state === "replied") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <MessageSquare className="h-3.5 w-3.5" />
        Driver replied {ago(data.lastDriverMessageAt)}
      </p>
    );
  }
  if (data.state === "opened_no_reply") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <Eye className="h-3.5 w-3.5" />
        Opened {ago(data.lastViewedAt)} · no reply yet
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <EyeOff className="h-3.5 w-3.5" />
      Link not opened yet
    </p>
  );
}
