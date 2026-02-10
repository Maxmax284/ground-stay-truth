import { useState, useMemo } from "react";
import { addDays, subDays, startOfDay, format, isSameDay, parseISO, isWithinInterval } from "date-fns";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarGrid } from "@/components/CalendarGrid";
import { CalendarLegend } from "@/components/CalendarLegend";
import { BookingFormDialog } from "@/components/BookingFormDialog";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { MaintenanceBlockDialog } from "@/components/MaintenanceBlockDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnits } from "@/hooks/useUnits";
import { useBookings } from "@/hooks/useBookings";
import { useMaintenanceBlocks } from "@/hooks/useMaintenanceBlocks";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { permissions } from "@/lib/permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, CalendarDays, Wrench } from "lucide-react";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";

const DEFAULT_DAYS = 30;
const MOBILE_DAYS = 7;

const CalendarView = () => {
  const { t } = useTranslation();
  const { isAdmin, role } = useAuth();
  const { data: units } = useUnits();
  const { data: policies } = usePolicySettings();
  const isMobile = useIsMobile();
  const activeUnits = useMemo(() => (units ?? []).filter((u) => u.is_active), [units]);

  const days = isMobile ? MOBILE_DAYS : DEFAULT_DAYS;
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const endDate = addDays(startDate, days);

  const [mobileUnitId, setMobileUnitId] = useState<string>("");
  const selectedMobileUnit = useMemo(() => {
    if (!isMobile) return null;
    const id = mobileUnitId || activeUnits[0]?.id;
    return activeUnits.find((u) => u.id === id) ?? activeUnits[0] ?? null;
  }, [isMobile, mobileUnitId, activeUnits]);

  const { data: bookings } = useBookings({
    dateFrom: format(startDate, "yyyy-MM-dd"),
    dateTo: format(endDate, "yyyy-MM-dd"),
  });

  const { data: maintenanceBlocks } = useMaintenanceBlocks({
    dateFrom: format(startDate, "yyyy-MM-dd"),
    dateTo: format(endDate, "yyyy-MM-dd"),
  });

  const [newBookingUnit, setNewBookingUnit] = useState<string | undefined>();
  const [newBookingDate, setNewBookingDate] = useState<string | undefined>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);

  const handleCellClick = (unitId: string, date: string) => {
    setNewBookingUnit(unitId);
    setNewBookingDate(date);
    setShowCreateDialog(true);
  };

  const handleBookingClick = (bookingId: string) => {
    setSelectedBookingId(bookingId);
  };

  const stepSize = isMobile ? 3 : 7;
  const goBack = () => setStartDate((d) => subDays(d, stepSize));
  const goForward = () => setStartDate((d) => addDays(d, stepSize));
  const goToday = () => setStartDate(startOfDay(new Date()));

  const cleaningBufferHours = useMemo(() => {
    const setting = policies?.find((p) => p.key === "cleaning_buffer_hours");
    return setting ? Number(setting.value) : 4;
  }, [policies]);

  const mobileDays = useMemo(() => {
    if (!isMobile || !selectedMobileUnit) return [];
    const result = [];
    for (let i = 0; i < MOBILE_DAYS; i++) {
      const date = addDays(startDate, i);
      const dateStr = format(date, "yyyy-MM-dd");
      const booking = (bookings ?? []).find((b) => {
        if (b.unit_id !== selectedMobileUnit.id) return false;
        return dateStr >= b.check_in && dateStr < b.check_out;
      });
      const maintenance = (maintenanceBlocks ?? []).find((mb) => {
        if (mb.unit_id !== selectedMobileUnit.id) return false;
        return dateStr >= mb.start_date && dateStr <= mb.end_date;
      });
      result.push({ date, dateStr, booking, maintenance });
    }
    return result;
  }, [isMobile, selectedMobileUnit, startDate, bookings, maintenanceBlocks]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("calendar.title")}</h1>
            <p className="text-muted-foreground mt-1">
              {isMobile ? t("calendar.visualOverview") : t("calendar.visualOverviewAll")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              <CalendarDays className="h-4 w-4 mr-1" /> {t("common.today")}
            </Button>
            <Button variant="outline" size="icon" onClick={goForward}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {format(startDate, "MMM d")} – {format(addDays(startDate, days - 1), "MMM d")}
            </span>
            {permissions.canManageMaintenanceBlocks(role) && (
              <Button variant="outline" size="sm" onClick={() => setShowMaintenanceDialog(true)}>
                <Wrench className="h-4 w-4 mr-1" /> {t("calendar.block")}
              </Button>
            )}
          </div>
        </div>

        {isMobile && activeUnits.length > 0 && (
          <Select value={selectedMobileUnit?.id ?? ""} onValueChange={setMobileUnitId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("calendar.selectUnit")} />
            </SelectTrigger>
            <SelectContent>
              {activeUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <CalendarLegend />

        {isMobile ? (
          <div className="space-y-2">
            {mobileDays.map(({ date, dateStr, booking, maintenance }) => {
              const isToday = isSameDay(date, new Date());
              return (
                <div
                  key={dateStr}
                  className={`rounded-lg border p-3 ${
                    maintenance
                      ? "bg-destructive/10 border-destructive/30"
                      : booking
                        ? "bg-primary/5 border-primary/20"
                        : "bg-card cursor-pointer active:bg-accent/50"
                  } ${isToday ? "ring-2 ring-primary/40" : ""}`}
                  onClick={() => {
                    if (booking) {
                      handleBookingClick(booking.id);
                    } else if (!maintenance && selectedMobileUnit) {
                      handleCellClick(selectedMobileUnit.id, dateStr);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {format(date, "EEE, MMM d")}
                        {isToday && <span className="text-primary ml-1 text-xs">({t("common.today")})</span>}
                      </p>
                    </div>
                    {maintenance ? (
                      <Badge variant="destructive" className="text-[10px]">
                        <Wrench className="h-3 w-3 mr-0.5" /> {t("calendar.blocked")}
                      </Badge>
                    ) : booking ? (
                      <Badge className={STATE_VARIANTS[booking.state as BookingState] ?? ""}>
                        {t(`states.${booking.state}`)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("calendar.available")}</span>
                    )}
                  </div>
                  {maintenance?.reason && (
                    <p className="text-xs text-muted-foreground mt-1">{maintenance.reason}</p>
                  )}
                  {booking && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {(booking as any).profiles?.full_name ?? t("common.guest")} · {format(new Date(booking.check_in), "MMM d")}–{format(new Date(booking.check_out), "MMM d")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <CalendarGrid
            units={activeUnits}
            bookings={bookings ?? []}
            maintenanceBlocks={maintenanceBlocks ?? []}
            startDate={startDate}
            days={DEFAULT_DAYS}
            cleaningBufferHours={cleaningBufferHours}
            onCellClick={handleCellClick}
            onBookingClick={handleBookingClick}
          />
        )}
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

      <MaintenanceBlockDialog
        open={showMaintenanceDialog}
        onOpenChange={setShowMaintenanceDialog}
        units={activeUnits}
      />
    </DashboardLayout>
  );
};

export default CalendarView;
