import { History } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { BookingHistoryList } from "@/components/BookingHistoryList";

export default function BookingHistory() {
  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="station-header">
          <div className="board-kicker">Audit</div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <History className="h-6 w-6 text-primary" /> Booking history
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Every stay's dates, room, price and discounts. Tap a stay to see how its price was built. Nothing here can be changed.</p>
        </div>
        <BookingHistoryList />
      </div>
    </DashboardLayout>
  );
}
