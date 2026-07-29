import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertTriangle, ChevronRight, Check, X, Percent, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getDiscountEligibility, DISCOUNT_TOOLTIP_HELP } from "@/lib/discountEligibility";
import { ApplyDiscountDialog } from "@/components/ApplyDiscountDialog";
import { FetchErrorState } from "@/components/FetchErrorState";
import { toast } from "sonner";
import { format, differenceInHours } from "date-fns";
import { useBookings, useTransitionBookingState } from "@/hooks/useBookings";
import { useUnits } from "@/hooks/useUnits";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { BookingFilters, type BookingSort } from "@/components/BookingFilters";
import { BookingFormDialog } from "@/components/BookingFormDialog";
import { BookingDetailSheet } from "@/components/BookingDetailSheet";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuestDirectory } from "@/components/guests/GuestDirectory";


function BookingStatusBadge({ booking }: { booking: any }) {
  const { t } = useTranslation();
  const { data: policies } = usePolicySettings();
  const state = booking.state as BookingState;

  // Shared resolver — honours staff deadline overrides, so an extended
  // booking stops screaming "Expired" the moment the override is saved.
  const deadlineInfo = getBookingDeadline(booking, policies as any);

  if (deadlineInfo) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge className={STATE_VARIANTS[state]}>
          {t(`states.${state}`)}
        </Badge>
        {deadlineInfo.isExpired ? (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            <AlertTriangle className="h-3 w-3 mr-0.5" /> {t("bookings.expired")}
          </Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">{describeDeadline(deadlineInfo)}</span>
        )}
        {deadlineInfo.source === "override" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Extended</Badge>
        )}
      </div>
    );
  }

  return (
    <Badge className={STATE_VARIANTS[state]}>
      {t(`states.${state}`)}
    </Badge>
  );
}


function BookingCard({ booking, onClick }: { booking: any; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-lg border bg-card p-4 cursor-pointer active:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground truncate">{booking.units?.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground truncate">{resolveGuestDisplayName(booking as any)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <BookingStatusBadge booking={booking} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{format(new Date(booking.check_in), "MMM d")} – {format(new Date(booking.check_out), "MMM d")}</span>
        <span>·</span>
        <span>{t("bookings.guestCount", { count: booking.num_guests })}</span>
      </div>
    </div>
  );
}

const Bookings = () => {
  const { t } = useTranslation();
  const { isAdmin, role } = useAuth();
  const { data: units } = useUnits();
  const isMobile = useIsMobile();
  const transition = useTransitionBookingState();
  const canApprove = permissions.canApproveBooking(role);

  const [stateFilter, setStateFilter] = useState<BookingState | null>(null);
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [sort, setSort] = useState<BookingSort>("check_in_asc");
  const [showCancelled, setShowCancelled] = useState(false);

  const { data: rawBookings, isLoading, isError, refetch } = useBookings({
    state: stateFilter,
    unitId: unitFilter,
    dateFrom,
    dateTo,
  });

  // Cancelled bookings are hidden unless explicitly toggled on (or explicitly
  // filtered for). Completed stays remain visible — they're operational history.
  const bookings = useMemo(() => {
    if (!rawBookings) return rawBookings;
    const visible = (showCancelled || stateFilter === "cancelled")
      ? rawBookings
      : rawBookings.filter((b: any) => b.state !== "cancelled");

    const name = (b: any) => (resolveGuestDisplayName(b) ?? "").toLowerCase();
    const sorted = [...visible];
    switch (sort) {
      case "check_in_asc":
        sorted.sort((a: any, b: any) => a.check_in.localeCompare(b.check_in));
        break;
      case "check_in_desc":
        sorted.sort((a: any, b: any) => b.check_in.localeCompare(a.check_in));
        break;
      case "created_desc":
        sorted.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
        break;
      case "guest_asc":
        sorted.sort((a: any, b: any) => name(a).localeCompare(name(b)));
        break;
      case "unit_asc":
        sorted.sort((a: any, b: any) =>
          (a.units?.name ?? "").localeCompare(b.units?.name ?? "") ||
          a.check_in.localeCompare(b.check_in));
        break;
    }
    return sorted;
  }, [rawBookings, showCancelled, stateFilter, sort]);


  const [showCreate, setShowCreate] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [discountBooking, setDiscountBooking] = useState<any | null>(null);
  const { data: policies } = usePolicySettings();

  const handleQuickApprove = async (e: React.MouseEvent, bookingId: string) => {
    e.stopPropagation();
    try {
      await transition.mutateAsync({ bookingId, fromState: "pending_approval", toState: "pending_deposit", reason: "Booking approved" });
      toast.success(t("approval.approved"));
    } catch { toast.error(t("approval.actionFailed")); }
  };

  const handleQuickReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await transition.mutateAsync({ bookingId: rejectId, fromState: "pending_approval", toState: "cancelled", reason: rejectReason });
      toast.success(t("approval.rejected"));
    } catch { toast.error(t("approval.actionFailed")); }
    finally { setRejectId(null); setRejectReason(""); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-ai-focus="bookings">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("bookings.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("bookings.manageReservations")}</p>
          </div>
          {permissions.canCreateBooking(role) && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> {t("bookings.newBooking")}
            </Button>
          )}
        </div>

        <Tabs defaultValue="bookings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="bookings">{t("guests.tabBookings")}</TabsTrigger>
            <TabsTrigger value="directory">{t("guests.tabDirectory")}</TabsTrigger>
          </TabsList>

          <TabsContent value="directory">
            <GuestDirectory onOpenBooking={(id) => setSelectedBookingId(id)} />
          </TabsContent>

          <TabsContent value="bookings" className="space-y-4">
        <BookingFilters
          state={stateFilter}
          unitId={unitFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          units={units ?? []}
          sort={sort}
          showCancelled={showCancelled}
          onStateChange={setStateFilter}
          onUnitChange={setUnitFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onSortChange={setSort}
          onShowCancelledChange={setShowCancelled}
        />

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : isError ? (
          <FetchErrorState message="Unable to load bookings" onRetry={() => refetch()} />
        ) : !bookings?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>{t("bookings.noBookings")}</p>
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} onClick={() => setSelectedBookingId(b.id)} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bookings.unit")}</TableHead>
                  <TableHead>{t("bookings.guest")}</TableHead>
                  <TableHead>{t("bookings.checkIn")}</TableHead>
                  <TableHead>{t("bookings.checkOut")}</TableHead>
                  <TableHead>{t("bookings.numGuests")}</TableHead>
                  <TableHead>{t("bookings.state")}</TableHead>
                  <TableHead>{t("bookings.created")}</TableHead>
                  {canApprove && <TableHead></TableHead>}
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
                    <TableCell className="text-muted-foreground">{resolveGuestDisplayName(b as any)}</TableCell>
                    <TableCell>{format(new Date(b.check_in), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(b.check_out), "MMM d, yyyy")}</TableCell>
                    <TableCell>{b.num_guests}</TableCell>
                    <TableCell>
                      <BookingStatusBadge booking={b} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(b.created_at), "MMM d")}
                    </TableCell>
                    {canApprove && (
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {b.state === "pending_approval" && (
                            <>
                              <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={(e) => handleQuickApprove(e, b.id)} disabled={transition.isPending}>
                                <Check className="h-3 w-3 mr-1" /> {t("approval.approve")}
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setRejectId(b.id); }} disabled={transition.isPending}>
                                <X className="h-3 w-3 mr-1" /> {t("approval.reject")}
                              </Button>
                            </>
                          )}
                          {(role === "admin" || role === "manager") && (() => {
                            const elig = getDiscountEligibility(b.state, (b as any).payments);
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 w-7 p-0"
                                        aria-label="Apply discount"
                                        disabled={!elig.allowed}
                                        onClick={() => setDiscountBooking(b)}
                                      >
                                        {elig.allowed ? <Percent className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-[240px]">
                                    <p className="text-xs">{elig.reason ?? DISCOUNT_TOOLTIP_HELP}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </TabsContent>
        </Tabs>
      </div>


      <BookingFormDialog open={showCreate} onOpenChange={setShowCreate} />
      <BookingDetailSheet
        bookingId={selectedBookingId}
        open={!!selectedBookingId}
        onOpenChange={(open) => !open && setSelectedBookingId(null)}
        isAdmin={isAdmin}
      />

      {discountBooking && (
        <ApplyDiscountDialog
          open={!!discountBooking}
          onOpenChange={(o) => !o && setDiscountBooking(null)}
          bookingId={discountBooking.id}
          currentTotal={Number(discountBooking.total_price ?? 0)}
          originalTotal={(discountBooking as any).original_total ?? null}
          hasUnpaidLink={false}
          policies={policies}
        />
      )}

      {/* Reject dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="bg-card border rounded-lg p-6 w-full max-w-md space-y-4 shadow-lg">
            <h3 className="text-lg font-semibold">{t("approval.rejectTitle")}</h3>
            <Input
              placeholder={t("approval.reasonPlaceholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setRejectId(null); setRejectReason(""); }}>{t("common.cancel")}</Button>
              <Button variant="destructive" disabled={!rejectReason.trim() || transition.isPending} onClick={handleQuickReject}>{t("approval.confirmReject")}</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Bookings;
