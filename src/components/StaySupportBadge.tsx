import { useMaintenanceRequests } from "@/hooks/useMaintenanceRequests";
import { useLaundryRequests } from "@/hooks/useLaundryRequests";
import { Wrench, Shirt } from "lucide-react";

interface StaySupportBadgeProps {
  bookingId: string;
}

export function StaySupportBadge({ bookingId }: StaySupportBadgeProps) {
  const { data: maintenance } = useMaintenanceRequests(bookingId);
  const { data: laundry } = useLaundryRequests(bookingId);

  const openMaintenance = (maintenance ?? []).filter((r) => r.status !== "resolved").length;
  const activeLaundry = (laundry ?? []).filter((r) => r.status === "ready_for_pickup").length;

  if (openMaintenance === 0 && activeLaundry === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {openMaintenance > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
          <Wrench className="h-3 w-3" /> {openMaintenance}
        </span>
      )}
      {activeLaundry > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
          <Shirt className="h-3 w-3" /> {activeLaundry}
        </span>
      )}
    </div>
  );
}
