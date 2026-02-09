import { useState, useMemo } from "react";
import { addDays, subDays, startOfDay, format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "@/components/CalendarGrid";
import { CalendarLegend } from "@/components/CalendarLegend";
import { BookingFormDialog } from "@/components/BookingFormDialog";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { useUnits } from "@/hooks/useUnits";
import { useBookings } from "@/hooks/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

const DEFAULT_DAYS = 30;

const CalendarView = () => {
  const { isAdmin } = useAuth();
  const { data: units } = useUnits();
  const { data: policies } = usePolicySettings();
  const activeUnits = useMemo(() => (units ?? []).filter((u) => u.is_active), [units]);

  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const endDate = addDays(startDate, DEFAULT_DAYS);

  // Fetch bookings within the visible range
  const { data: bookings } = useBookings({
    dateFrom: format(startDate, "yyyy-MM-dd"),
    dateTo: format(endDate, "yyyy-MM-dd"),
  });

  // Click-to-book state
  const [newBookingUnit, setNewBookingUnit] = useState<string | undefined>();
  const [newBookingDate, setNewBookingDate] = useState<string | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Detail sheet state
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const handleCellClick = (unitId: string, date: string) => {
    setNewBookingUnit(unitId);
    setNewBookingDate(date);
    setShowCreateDialog(true);
  };

  const handleBookingClick = (bookingId: string) => {
    setSelectedBookingId(bookingId);
  };

  const goBack = () => setStartDate((d) => subDays(d, 7));
  const goForward = () => setStartDate((d) => addDays(d, 7));
  const goToday = () => setStartDate(startOfDay(new Date()));

  const cleaningBufferHours = useMemo(() => {
    const setting = policies?.find((p) => p.key === "cleaning_buffer_hours");
    return setting ? Number(setting.value) : 4;
  }, [policies]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
            <p className="text-muted-foreground mt-1">
              Visual overview of availability across all units
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              <CalendarDays className="h-4 w-4 mr-1" /> Today
            </Button>
            <Button variant="outline" size="icon" onClick={goForward}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {format(startDate, "MMM d")} – {format(addDays(startDate, DEFAULT_DAYS - 1), "MMM d, yyyy")}
            </span>
          </div>
        </div>

        <CalendarLegend />

        <CalendarGrid
          units={activeUnits}
          bookings={bookings ?? []}
          startDate={startDate}
          days={DEFAULT_DAYS}
          cleaningBufferHours={cleaningBufferHours}
          onCellClick={handleCellClick}
          onBookingClick={handleBookingClick}
        />
      </div>

      <BookingFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultUnitId={newBookingUnit}
        defaultCheckIn={newBookingDate}
      />

      <BookingDetailSheet
        bookingId={selectedBookingId}
        open={!!selectedBookingId}
        onOpenChange={(open) => !open && setSelectedBookingId(null)}
        isAdmin={isAdmin}
      />
    </DashboardLayout>
  );
};

export default CalendarView;
