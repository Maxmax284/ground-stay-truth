import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertTriangle } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { useBookings } from "@/hooks/useBookings";
import { useUnits } from "@/hooks/useUnits";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { BookingFilters } from "@/components/BookingFilters";
import { BookingFormDialog } from "@/components/BookingFormDialog";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { STATE_LABELS, STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";

function BookingStatusBadge({ booking }: { booking: any }) {
  const { data: policies } = usePolicySettings();
  const state = booking.state as BookingState;

  const deadlineInfo = (() => {
    if (state === "soft_hold") {
      const expiryHours = policies?.find((p: any) => p.key === "soft_hold_expiration_hours");
      const hours = expiryHours ? Number(expiryHours.value) : 12;
      const elapsed = differenceInHours(new Date(), new Date(booking.created_at));
      return { isExpired: elapsed >= hours, remaining: hours - elapsed };
    }
    if (state === "pending_deposit") {
      const deadlineHours = policies?.find((p: any) => p.key === "deposit_deadline_hours");
      const hours = deadlineHours ? Number(deadlineHours.value) : 24;
      const elapsed = differenceInHours(new Date(), new Date(booking.updated_at));
      return { isExpired: elapsed >= hours, remaining: hours - elapsed };
    }
    return null;
  })();

  if (deadlineInfo) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge className={STATE_VARIANTS[state]}>
          {STATE_LABELS[state]}
        </Badge>
        {deadlineInfo.isExpired ? (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            <AlertTriangle className="h-3 w-3 mr-0.5" /> Expired
          </Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">{deadlineInfo.remaining}h left</span>
        )}
      </div>
    );
  }

  return (
    <Badge className={STATE_VARIANTS[state]}>
      {STATE_LABELS[state]}
    </Badge>
  );
}

const Bookings = () => {
  const { isAdmin, role } = useAuth();
  const { data: units } = useUnits();

  // Filters
  const [stateFilter, setStateFilter] = useState<BookingState | null>(null);
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const { data: bookings, isLoading } = useBookings({
    state: stateFilter,
    unitId: unitFilter,
    dateFrom,
    dateTo,
  });

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
            <p className="text-muted-foreground mt-1">Manage reservations and booking states</p>
          </div>
          {permissions.canCreateBooking(role) && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Booking
            </Button>
          )}
        </div>

        <BookingFilters
          state={stateFilter}
          unitId={unitFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          units={units ?? []}
          onStateChange={setStateFilter}
          onUnitChange={setUnitFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !bookings?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>No bookings found.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedBookingId(b.id)}
                  >
                    <TableCell className="font-medium">{b.units?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{(b as any).profiles?.full_name ?? "—"}</TableCell>
                    <TableCell>{format(new Date(b.check_in), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(b.check_out), "MMM d, yyyy")}</TableCell>
                    <TableCell>{b.num_guests}</TableCell>
                    <TableCell>
                      <BookingStatusBadge booking={b} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(b.created_at), "MMM d")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <BookingFormDialog open={showCreate} onOpenChange={setShowCreate} />
      <BookingDetailSheet
        bookingId={selectedBookingId}
        open={!!selectedBookingId}
        onOpenChange={(open) => !open && setSelectedBookingId(null)}
        isAdmin={isAdmin}
      />
    </DashboardLayout>
  );
};

export default Bookings;
