import { useState, useMemo, useRef, useEffect } from "react";
import { toast as sonnerToast } from "sonner";
import { getTravelState } from "@/lib/travelState";
import { supabase } from "@/integrations/supabase/client";
import { useAirportPickup } from "@/hooks/useAirportPickups";
import { useGuestHistory } from "@/hooks/useGuestHistory";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { format, differenceInHours } from "date-fns";
import { formatInPropertyTimezone } from "@/lib/timezone";
import { useBooking, useBookingStateLog, useBookingPayments, useBookingMessages, useCreatePayment, useRefundPayment, useCreateMessage, useMarkMessagesRead } from "@/hooks/useBookings";
import { BookingStateTransition } from "@/components/BookingStateTransition";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { formatPrice } from "@/lib/currency";
import { calculateOutstanding, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_VARIANTS, PAYMENT_TYPE_LABELS, getPaymentProvenance, type PaymentStatus, type PaymentType } from "@/lib/paymentTypes";
import { CalendarDays, CreditCard, MessageSquare, History, ArrowRight, AlertTriangle, User, FileText, Info, Wrench, Shirt, Globe, Sparkles, RotateCcw, Paperclip, Image as ImageIcon, File, X, Loader2, Activity } from "lucide-react";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { RefundDialog } from "@/components/RefundDialog";
import { GuestPortalActivityTimeline } from "@/components/GuestPortalActivityTimeline";
import { PaymentLinkManager } from "@/components/PaymentLinkManager";
import { GuestDocumentUpload } from "@/components/GuestDocumentUpload";
import { RequiredDocumentsCard } from "@/components/RequiredDocumentsCard";
import { SecurityDepositSection } from "@/components/SecurityDepositSection";
import { BookingFinancialSummary } from "@/components/BookingFinancialSummary";
import { PaymentGuideLink } from "@/components/PaymentGuideLink";
import { BookingTrainingSection } from "@/components/BookingTrainingSection";
import { useBookingTrainingLinks } from "@/hooks/useTrainingPackages";
import { AirportPickupSection } from "@/components/AirportPickupSection";
import { AdminOverrideMenu } from "@/components/AdminOverrideMenu";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import { useMaintenanceRequests, useUpdateMaintenanceStatus } from "@/hooks/useMaintenanceRequests";
import { useLaundryRequests, useAdvanceLaundryStatus, getNextLaundryStatus } from "@/hooks/useLaundryRequests";
import { StaySupportBadge } from "@/components/StaySupportBadge";
import { PreArrivalBadge } from "@/components/PreArrivalChecklist";
import { TrainingBadge } from "@/components/TrainingBadge";
import { useMessageTranslation } from "@/hooks/useMessageTranslation";
import { useProfile } from "@/hooks/useProfile";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { useAISettings } from "@/hooks/useAISettings";
import { useBookingReview } from "@/hooks/useReviews";
import { setAIFocus, clearAIFocus } from "@/lib/aiFocusStore";
import { AIBriefingCard } from "@/components/ai/AIBriefingCard";
import { BookingConfirmationDocument } from "@/components/BookingConfirmationDocument";
import { BookingEmailStatus } from "@/components/BookingEmailStatus";

import { ApplyDiscountDialog } from "@/components/ApplyDiscountDialog";
import { BookingAdjustmentsCard } from "@/components/BookingAdjustmentsCard";
import { getDiscountEligibility, DISCOUNT_TOOLTIP_HELP } from "@/lib/discountEligibility";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, Percent as PercentIcon } from "lucide-react";
import { getBookingDeadline, describeDeadline } from "@/lib/bookingDeadline";
import { ExtendDeadlineDialog } from "@/components/ExtendDeadlineDialog";

interface BookingDetailSheetProps { bookingId: string | null; open: boolean; onOpenChange: (open: boolean) => void; isAdmin: boolean; }

export function BookingDetailSheet({ bookingId, open, onOpenChange, isAdmin }: BookingDetailSheetProps) {
  const { t } = useTranslation();
  const { role } = useAuth();

  // Context isolation: clear Kru Glitch chat when switching between bookings
  const prevBookingRef = useRef<string | null>(null);
  useEffect(() => {
    if (bookingId && open && prevBookingRef.current && prevBookingRef.current !== bookingId) {
      window.dispatchEvent(new CustomEvent("kru-glitch-clear"));
    }
    if (bookingId && open) {
      prevBookingRef.current = bookingId;
    }
  }, [bookingId, open]);
  const { data: booking } = useBooking(bookingId);
  const { data: pickup } = useAirportPickup(bookingId);
  const guestId = (booking as any)?.guest_id;
  const { data: guestHistory } = useGuestHistory(guestId);
  const { data: stateLog } = useBookingStateLog(bookingId);
  const { data: payments } = useBookingPayments(bookingId);
  const { data: messages } = useBookingMessages(bookingId);
  const { data: policies } = usePolicySettings();
  const { data: documents } = useGuestDocuments(bookingId ?? "");
  const { data: trainingLinks } = useBookingTrainingLinks(bookingId);
  const markRead = useMarkMessagesRead();

  const canSeeAmounts = permissions.canViewPaymentAmounts(role);
  const canRecordPay = permissions.canRecordPayment(role);
  const canApplyDiscount = role === "admin" || role === "manager";
  // Portal activity is staff-only telemetry; RLS limits reads to admin/manager.
  const canSeePortalActivity = role === "admin" || role === "manager";
  const [discountOpen, setDiscountOpen] = useState(false);

  // Central eligibility helper — same rule everywhere discounts are offered.
  const eligibility = useMemo(
    () => getDiscountEligibility(booking?.state, payments as any),
    [booking?.state, payments],
  );
  const hasUnpaidLink = false; // link visibility lives in PaymentLinkManager; edge fn revokes if present
  const discountBlockedReason = eligibility.allowed ? null : eligibility.reason;

  // Single source of truth for hold / deposit clocks — honours staff overrides.
  const deadlineInfo = useMemo(
    () => getBookingDeadline(booking, policies as any),
    [booking, policies],
  );
  const softHoldInfo = (booking?.state as BookingState) === "soft_hold" && deadlineInfo
    ? { ...deadlineInfo, remaining: deadlineInfo.hoursRemaining, hours: deadlineInfo.policyHours }
    : null;
  const depositDeadlineInfo = (booking?.state as BookingState) === "pending_deposit" && deadlineInfo
    ? { ...deadlineInfo, remaining: deadlineInfo.hoursRemaining, hours: deadlineInfo.policyHours }
    : null;
  const canOverrideDeadline = permissions.canOverrideDeposit(role);
  const [extendOpen, setExtendOpen] = useState(false);

  const { data: maintenanceReqs } = useMaintenanceRequests(bookingId);
  const { data: laundryReqs } = useLaundryRequests(bookingId);

  const openMaintenanceCount = (maintenanceReqs ?? []).filter((r) => r.status !== "resolved").length;
  const laundryReadyCount = (laundryReqs ?? []).filter((r) => r.status === "ready_for_pickup").length;
  const isCheckedIn = booking?.state === "checked_in";
  const isCompleted = booking?.state === "completed";
  const { data: bookingReview } = useBookingReview(isCompleted ? bookingId ?? undefined : undefined);
  const nextStep = useMemo(() => {
    if (!booking) return null;
    const state = booking.state as BookingState;
    const hasDocuments = (documents?.length ?? 0) > 0;
    const hasPaid = (payments?.length ?? 0) > 0;

    // Stay support alerts for checked-in bookings
    const supportAlerts: string[] = [];
    if (state === "checked_in") {
      if (openMaintenanceCount > 0) {
        supportAlerts.push(t("staySupport.openMaintenanceCount", { count: openMaintenanceCount }));
      }
      if (laundryReadyCount > 0) {
        supportAlerts.push(t("staySupport.laundryReady"));
      }
    }

    switch (state) {
      case "inquiry": return t("bookingDetail.nextSteps.inquiry");
      case "soft_hold": return softHoldInfo?.isExpired ? t("bookingDetail.nextSteps.softHoldExpired") : t("bookingDetail.nextSteps.softHold");
      case "pending_approval": return t("bookingDetail.nextSteps.pendingApproval");
      case "pending_deposit": {
        const depositPct = policies?.find((p) => p.key === "deposit_percentage");
        const pct = depositPct ? Number(depositPct.value) : 100;
        const depositAmt = booking.total_price ? (Number(booking.total_price) * pct / 100) : null;
        const amountStr = depositAmt != null ? ` (${formatPrice(depositAmt, policies)})` : "";
        if (depositDeadlineInfo?.isExpired) return t("bookingDetail.nextSteps.depositExpired");
        if (hasPaid) return t("bookingDetail.nextSteps.depositPaid");
        return `${t("bookingDetail.nextSteps.depositNeeded")}${amountStr}`;
      }
      case "confirmed": return t("bookingDetail.nextSteps.readyCheckin");
      case "checked_in": {
        const base = t("bookingDetail.nextSteps.checkout");
        return supportAlerts.length > 0 ? `${base} · ${supportAlerts.join(" · ")}` : base;
      }
      default: return null;
    }
  }, [booking, documents, payments, softHoldInfo, depositDeadlineInfo, openMaintenanceCount, laundryReadyCount, t]);

  const travelInfo = useMemo(() => {
    if (!pickup) return null;
    return getTravelState({
      status: pickup.status,
      flight_number: pickup.flight_number,
      international_flight_number: (pickup as any).international_flight_number,
      final_flight_confirmed: (pickup as any).final_flight_confirmed ?? false,
      confirmed_airport: (pickup as any).confirmed_airport,
      guest_landed_at: (pickup as any).guest_landed_at,
      arrival_datetime: pickup.arrival_datetime,
    });
  }, [pickup]);

  const guestName = booking ? resolveGuestDisplayName(booking as any) : undefined;

  // Phase 2: set AI focus so Kru Glitch knows which booking is on-screen.
  // Phase 4: include guest contact so draft handoff buttons work.
  useEffect(() => {
    if (!bookingId || !open) return;
    const unitName = (booking as any)?.units?.name;
    const label = [guestName, unitName].filter(Boolean).join(" · ") || undefined;
    const b: any = booking || {};
    const guestPhone =
      b.manual_guest_phone || b.profiles?.phone || b.guest?.phone || undefined;
    const guestEmail =
      b.manual_guest_email || b.profiles?.email || b.guest?.email || undefined;
    setAIFocus({
      kind: "booking",
      bookingId,
      label,
      guestName,
      guestPhone: guestPhone || undefined,
      guestEmail: guestEmail || undefined,
    });
    return () => clearAIFocus(bookingId);
  }, [bookingId, open, guestName, (booking as any)?.units?.name, (booking as any)?.manual_guest_phone, (booking as any)?.profiles?.phone, (booking as any)?.manual_guest_email, (booking as any)?.profiles?.email]);

  const TRAVEL_BADGE_STYLES: Record<string, string> = {
    info: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    muted: "bg-muted text-muted-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };

  if (!booking) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3 flex-wrap">
            <span>{booking.units?.name ?? t("bookingDetail.unknownUnit")}</span>
            <Badge className={STATE_VARIANTS[booking.state as BookingState]}>{t(`states.${booking.state}`)}</Badge>
            {travelInfo && travelInfo.state !== "cancelled" && (
              <Badge className={`text-[10px] ${TRAVEL_BADGE_STYLES[travelInfo.severity]}`} title={travelInfo.staffDetail}>
                ✈ {travelInfo.staffLabel}
              </Badge>
            )}
            <PreArrivalBadge bookingId={booking.id} />
            {isCheckedIn && <StaySupportBadge bookingId={booking.id} />}
            {trainingLinks && trainingLinks.length > 0 && <TrainingBadge />}
          </SheetTitle>
          {guestName && <div className="flex items-center gap-2 text-sm text-foreground"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{guestName}</span>{guestHistory?.isReturning && <Badge variant="secondary" className="text-[10px]">{t("loyalty.returningGuest", { count: (guestHistory.completedStays ?? 0) + 1 })}</Badge>}{isCompleted && (bookingReview ? <Badge className={`text-[10px] ${bookingReview.status === "approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : bookingReview.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>{t("reviews.reviewStatus", { defaultValue: "Review" })}: {t(`reviews.${bookingReview.status}`)}</Badge> : <span className="text-xs text-muted-foreground">{t("reviews.noReviewSubmitted", { defaultValue: "No review submitted" })}</span>)}</div>}
          {softHoldInfo && (
            <div className={`flex items-center gap-2 text-sm ${softHoldInfo.isExpired ? "text-destructive" : "text-warning-foreground"}`}>
              <AlertTriangle className="h-4 w-4" />
              {softHoldInfo.isExpired ? t("bookingDetail.softHoldExpired") : t("bookingDetail.softHoldExpires", { hours: softHoldInfo.remaining })}
            </div>
          )}
          {(booking.state as BookingState) === "soft_hold" && (
            <p className="text-xs text-muted-foreground italic">{t("bookingDetail.softHoldDisclaimer", { defaultValue: "This hold does not guarantee availability until the booking is confirmed with a deposit." })}</p>
          )}
          {depositDeadlineInfo && (
            <div className={`flex items-center gap-2 text-sm ${depositDeadlineInfo.isExpired ? "text-destructive" : "text-warning-foreground"}`}>
              <AlertTriangle className="h-4 w-4" />
              {depositDeadlineInfo.isExpired ? t("bookingDetail.depositExpired") : t("bookingDetail.depositExpires", { hours: depositDeadlineInfo.remaining })}
            </div>
          )}
          {/* Deadline override — lets staff put an expired hold back in play. */}
          {deadlineInfo && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Deadline: {format(deadlineInfo.deadline, "MMM d, HH:mm")} · {describeDeadline(deadlineInfo)}
                {deadlineInfo.source === "override" && " · extended by staff"}
              </span>
              {canOverrideDeadline && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setExtendOpen(true)}>
                  {deadlineInfo.isExpired ? "Override expiry" : "Extend deadline"}
                </Button>
              )}
            </div>
          )}

          {nextStep && <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-md px-3 py-2"><Info className="h-4 w-4 shrink-0" /><span><strong>{t("common.next")}:</strong> {nextStep}</span></div>}
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /><span>{format(new Date(booking.check_in), "MMM d, yyyy")}</span><ArrowRight className="h-3 w-3" /><span>{format(new Date(booking.check_out), "MMM d, yyyy")}</span></div>
          <div className="text-sm text-muted-foreground">
            {t("bookings.guestCount", { count: booking.num_guests })}
            {booking.guest_type && <Badge variant="outline" className="ml-2 text-xs">{t(`guestBooking.guestTypes.${booking.guest_type}`, { defaultValue: booking.guest_type })}</Badge>}
            {booking.notes && <span className="block mt-1 italic">"{booking.notes}"</span>}
            {(booking as any).flight_number && <span className="block mt-1 text-xs">✈️ Flight: <strong>{(booking as any).flight_number}</strong></span>}
          </div>
          {booking.arrival_details && typeof booking.arrival_details === "object" && Object.keys(booking.arrival_details).length > 0 && (
            <div className="text-sm space-y-1 bg-muted/30 rounded-md p-2">
              <p className="font-medium text-xs text-muted-foreground">{t("guestBooking.arrivalDetails")}</p>
              {(booking.arrival_details as any).flight_info && <p className="text-xs">✈️ {(booking.arrival_details as any).flight_info}</p>}
              {(booking.arrival_details as any).arrival_time && <p className="text-xs">🕐 {(booking.arrival_details as any).arrival_time}</p>}
              {(booking.arrival_details as any).emergency_contact && <p className="text-xs">🚨 {(booking.arrival_details as any).emergency_contact}</p>}
              {(booking.arrival_details as any).airport_pickup && <p className="text-xs">🛬 {t("guestBooking.airportPickup", { defaultValue: "Airport Pickup Requested" })}</p>}
            </div>
          )}
        </SheetHeader>
        <div className="mt-2">
          <AIBriefingCard bookingId={booking.id} variant="compact" />
        </div>
        <AirportPickupSection bookingId={booking.id} guestName={guestName} />
        {isAdmin && <AdminOverrideMenu bookingId={booking.id} pickupId={pickup?.id ?? null} />}
        <SecurityDepositSection bookingId={booking.id} bookingState={booking.state} />
        <BookingTrainingSection bookingId={booking.id} />
        <div className="pt-3 space-y-2">
          <BookingFinancialSummary
            bookingId={booking.id}
            totalPrice={booking.total_price}
            propertyId={(booking as any).property_id ?? null}
            canSeeAmounts={canSeeAmounts}
          />
          {canSeeAmounts && (
            <BookingAdjustmentsCard
              bookingId={booking.id}
              canManage={eligibility.allowed && (role === "admin" || role === "manager")}
              policies={policies}
            />
          )}
          {canApplyDiscount && (
            <div className="flex flex-col items-end gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDiscountOpen(true)}
                        disabled={!!discountBlockedReason}
                        aria-label="Apply discount"
                      >
                        {discountBlockedReason ? (
                          <Lock className="h-3.5 w-3.5 mr-1.5" />
                        ) : (
                          <PercentIcon className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Apply discount
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[240px]">
                    <p className="text-xs">
                      {discountBlockedReason ?? DISCOUNT_TOOLTIP_HELP}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {discountBlockedReason && (
                <p className="text-[10px] text-muted-foreground italic">{discountBlockedReason}</p>
              )}
            </div>
          )}
        </div>
        <ApplyDiscountDialog
          open={discountOpen}
          onOpenChange={setDiscountOpen}
          bookingId={booking.id}
          currentTotal={Number(booking.total_price ?? 0)}
          originalTotal={(booking as any).original_total ?? null}
          hasUnpaidLink={hasUnpaidLink}
          policies={policies}
        />
        <ExtendDeadlineDialog
          bookingId={booking.id}
          state={booking.state as string}
          info={deadlineInfo}
          open={extendOpen}
          onOpenChange={setExtendOpen}
        />
        <Separator />
        <div className="py-4"><BookingStateTransition bookingId={booking.id} currentState={booking.state as BookingState} isAdmin={isAdmin} checkInDate={booking.check_in} totalPrice={booking.total_price} unitId={booking.unit_id} /></div>
        <Tabs defaultValue="history" className="mt-2" onValueChange={(val) => {
          if (val === "messages" && bookingId) {
            markRead.mutate(bookingId);
          }
        }}>
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1"><History className="h-4 w-4 mr-1" /> {t("bookingDetail.historyTab")}</TabsTrigger>
            <TabsTrigger value="payments" className="flex-1"><CreditCard className="h-4 w-4 mr-1" /> {t("bookingDetail.paymentsTab")}</TabsTrigger>
            <TabsTrigger value="messages" className="flex-1"><MessageSquare className="h-4 w-4 mr-1" /> {t("bookingDetail.notesTab")}</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1"><FileText className="h-4 w-4 mr-1" /> {t("bookingDetail.documentsTab")}</TabsTrigger>
            {canSeePortalActivity && (
              <TabsTrigger value="portal" className="flex-1"><Activity className="h-4 w-4 mr-1" /> Portal</TabsTrigger>
            )}
            {isCheckedIn && (
              <TabsTrigger value="support" className="flex-1"><Wrench className="h-4 w-4 mr-1" /> {t("staySupport.tabLabel")}</TabsTrigger>
            )}
          </TabsList>
          {canSeePortalActivity && (
            <TabsContent value="portal"><GuestPortalActivityTimeline bookingId={booking.id} /></TabsContent>
          )}

          <TabsContent value="history"><StateHistoryTab logs={stateLog ?? []} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab payments={payments ?? []} bookingId={booking.id} bookingState={booking.state as string} canSeeAmounts={canSeeAmounts} canRecord={canRecordPay} policies={policies} totalPrice={booking.total_price} /></TabsContent>
          <TabsContent value="messages"><MessagesTab messages={messages ?? []} bookingId={booking.id} /></TabsContent>
          <TabsContent value="documents"><div className="py-3"><RequiredDocumentsCard bookingId={booking.id} checkIn={booking.check_in} checkOut={booking.check_out} /></div></TabsContent>
          {isCheckedIn && (
            <TabsContent value="support">
              <BookingSupportTab
                bookingId={booking.id}
                maintenanceRequests={maintenanceReqs ?? []}
                laundryRequests={laundryReqs ?? []}
                role={role}
              />
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function StateHistoryTab({ logs }: { logs: any[] }) {
  const { t } = useTranslation();
  if (logs.length === 0) return <p className="text-sm text-muted-foreground py-4">{t("bookingDetail.noHistory")}</p>;
  return (
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-3 py-3">
        {logs.map((log) => {
          const isSystem = !log.changed_by;
          const isAdminOverride = log.reason?.startsWith("[ADMIN OVERRIDE]");
          const dotColor = isAdminOverride ? "bg-destructive" : isSystem ? "bg-muted-foreground" : "bg-primary";
          return (
            <div key={log.id} className="flex items-start gap-3 text-sm">
              <div className={`mt-1 h-2 w-2 rounded-full ${dotColor} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {log.from_state && (<><Badge variant="outline" className="text-xs">{t(`states.${log.from_state}`)}</Badge><ArrowRight className="h-3 w-3 text-muted-foreground" /></>)}
                  <Badge variant="outline" className="text-xs">{t(`states.${log.to_state}`)}</Badge>
                  {isAdminOverride && <Badge variant="destructive" className="text-xs ml-1">{t("bookingDetail.adminOverride")}</Badge>}
                  {isSystem && !isAdminOverride && <Badge variant="secondary" className="text-xs ml-1">{t("bookingDetail.system")}</Badge>}
                </div>
                {log.reason && <p className="text-muted-foreground mt-1">{log.reason}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground">{formatInPropertyTimezone(log.created_at)}</p>
                  {log.changed_by_name && <span className="text-xs text-muted-foreground">— {log.changed_by_name}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function PaymentsTab({ payments, bookingId, bookingState, canSeeAmounts, canRecord, policies, totalPrice }: { payments: any[]; bookingId: string; bookingState: string; canSeeAmounts: boolean; canRecord: boolean; policies?: any[]; totalPrice?: number | null }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role } = useAuth();
  const createPayment = useCreatePayment();
  const refundPayment = useRefundPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState<string>("deposit");
  const [refundTarget, setRefundTarget] = useState<any>(null);

  const isAdmin = role === "admin";

  const balance = useMemo(
    () => calculateOutstanding(totalPrice ?? null, payments),
    [totalPrice, payments]
  );

  const handleRecord = async () => {
    if (!amount || Number(amount) <= 0) { toast({ title: t("payments.enterValidAmount"), variant: "destructive" }); return; }
    try {
      await createPayment.mutateAsync({ booking_id: bookingId, amount: Number(amount), method, notes: notes || undefined, payment_type: paymentType });
      toast({ title: t("payments.paymentRecorded") }); setAmount(""); setNotes("");
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  const handleRefund = async (paymentId: string, refundAmount: number, reason: string) => {
    try {
      await refundPayment.mutateAsync({ paymentId, bookingId, refundAmount, reason });
      toast({ title: t("payments.refundIssued", { defaultValue: "Refund issued successfully" }) });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const canRefund = (p: any) => isAdmin && ["recorded", "partially_refunded"].includes(p.status) && Number(p.amount) > Number(p.refund_amount ?? 0);

  return (
    <div className="space-y-4 py-3">
      {/* Outstanding balance summary */}
      {canSeeAmounts && totalPrice != null && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("payments.totalStayCost", { defaultValue: "Total Stay Cost" })}</span>
            <span className="font-semibold">{formatPrice(totalPrice, policies)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("payments.totalPaid", { defaultValue: "Total Paid" })}</span>
            <span className="font-medium text-[hsl(var(--success))]">{formatPrice(balance.totalPaid, policies)}</span>
          </div>
          {balance.totalRefunded > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.totalRefunded", { defaultValue: "Refunded" })}</span>
                <span className="font-medium text-[hsl(var(--info))]">−{formatPrice(balance.totalRefunded, policies)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.netPaid", { defaultValue: "Net Paid" })}</span>
                <span className="font-medium">{formatPrice(balance.totalPaid - balance.totalRefunded, policies)}</span>
              </div>
            </>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between text-sm">
            <span className="font-medium">{t("payments.outstanding", { defaultValue: "Outstanding" })}</span>
            <span className={`font-semibold ${balance.outstanding > 0 ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
              {balance.outstanding > 0 ? formatPrice(balance.outstanding, policies) : t("payments.fullyPaid", { defaultValue: "Fully Paid" })}
            </span>
          </div>
        </div>
      )}

      {/* Payment list with type badges + status indicators + refund button */}
      {payments.length > 0 ? (
        <ScrollArea className="max-h-[220px]">
          <div className="space-y-2">
            {payments.map((p) => {
              const statusLabel = PAYMENT_STATUS_LABELS[p.status as PaymentStatus] ?? p.status;
              const statusVariant = PAYMENT_STATUS_VARIANTS[p.status as PaymentStatus] ?? "bg-muted text-muted-foreground";
              const typeLabel = PAYMENT_TYPE_LABELS[p.payment_type as PaymentType] ?? p.payment_type;
              const showProvenance = p.status === "recorded" || p.status === "partially_refunded";
              const prov = showProvenance ? getPaymentProvenance(p) : null;
              return (
                <div key={p.id} className="flex items-start justify-between text-sm border rounded-md p-3 gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {canSeeAmounts ? <span className="font-medium">{formatPrice(p.amount, policies)}</span> : <Badge variant="outline" className="text-xs">{Number(p.amount) > 0 ? t("payments.paid") : t("payments.unpaid")}</Badge>}
                      <Badge className={`text-[10px] border-0 ${statusVariant}`}>{statusLabel}</Badge>
                      <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
                      {prov && (
                        <Badge className={`text-[10px] ${prov.className}`} title={prov.tooltip}>
                          {prov.icon} {prov.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                      {canSeeAmounts && p.method && <span>{t(`payments.methods.${p.method}`, { defaultValue: p.method })}</span>}
                      {canSeeAmounts && p.provider && p.provider !== "manual" && p.provider !== "pending" && <span>· {p.provider}</span>}
                      {canSeeAmounts && p.source_channel && p.source_channel !== "front_desk" && (
                        <Badge variant="secondary" className="text-[10px]">{t(`deposit.channels.${p.source_channel}`, { defaultValue: p.source_channel })}</Badge>
                      )}
                    </div>
                    {p.description && canSeeAmounts && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    {p.notes && canSeeAmounts && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
                    {p.refund_amount != null && Number(p.refund_amount) > 0 && canSeeAmounts && (
                      <p className="text-xs text-[hsl(var(--info))]">↩ Refund: {formatPrice(p.refund_amount, policies)}{p.refund_reason ? ` — ${p.refund_reason}` : ""}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatInPropertyTimezone(p.created_at, "date")}</span>
                    {canRefund(p) && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setRefundTarget(p)}>
                        <RotateCcw className="h-3 w-3" /> {t("payments.refund", { defaultValue: "Refund" })}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : <p className="text-sm text-muted-foreground">{t("payments.noPayments")}</p>}

      {canRecord && (
        <>
          <Separator />
          <PaymentLinkManager bookingId={bookingId} />
          <PaymentGuideLink />
          <BookingConfirmationDocument bookingId={bookingId} bookingState={bookingState} variant="full" allowPending />
          <BookingEmailStatus bookingId={bookingId} />

        </>
      )}

      {/* Record payment form */}
      {canRecord && (
        <>
          <Separator />
          <h4 className="text-sm font-semibold">{t("payments.recordPayment")}</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This is only for offline money — cash, bank transfer, or whatever else happens face-to-face. If the guest already paid through the Stripe link up top, it&apos;s already in the system. You do not need to touch this.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">{t("payments.amount")} *</Label><Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={balance.outstanding > 0 ? balance.outstanding.toFixed(2) : ""} /></div>
            <div className="space-y-1"><Label className="text-xs">{t("payments.method")}</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("payments.methods.cash", { defaultValue: "Cash" })}</SelectItem>
                  <SelectItem value="bank_transfer">{t("payments.methods.bank_transfer", { defaultValue: "Bank Transfer" })}</SelectItem>
                  <SelectItem value="other">{t("payments.methods.other", { defaultValue: "Other (offline)" })}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Card payments go through Stripe only — use Generate Payment Link above.</p>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("payments.paymentType", { defaultValue: "Payment Type" })}</Label>
            <Select value={paymentType} onValueChange={setPaymentType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(PAYMENT_TYPE_LABELS) as [string, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder={t("payments.paymentNotes")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <Button size="sm" onClick={handleRecord} disabled={createPayment.isPending} className="w-full">{createPayment.isPending ? t("common.recording") : t("payments.recordPayment")}</Button>
        </>
      )}

      {/* Refund dialog */}
      <RefundDialog
        open={!!refundTarget}
        onOpenChange={(v) => { if (!v) setRefundTarget(null); }}
        payment={refundTarget}
        policies={policies}
        onConfirm={handleRefund}
        isPending={refundPayment.isPending}
      />
    </div>
  );
}

function MessageBubble({ msg, translate, clearTranslation, translations, isTranslating, preferredLang }: { msg: any; translate: any; clearTranslation: any; translations: Record<string, any>; isTranslating: boolean; preferredLang: string }) {
  const { t } = useTranslation();
  const translation = translations[msg.id];
  const isImage = msg.attachment_type?.startsWith("image/");
  return (
    <div className="text-sm space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant={msg.is_internal ? "secondary" : "outline"} className="text-xs">{msg.is_internal ? t("messages.internal") : t("messages.guestVisible")}</Badge>
        <span className="text-xs text-muted-foreground">{format(new Date(msg.created_at), "MMM d, h:mm a")}</span>
        {!translation && (
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs gap-1 text-muted-foreground" onClick={() => translate(msg.id, msg.content, preferredLang)} disabled={isTranslating}>
            <Globe className="h-3 w-3" />{t("translation.translate")}
          </Button>
        )}
        {translation && (
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs gap-1 text-muted-foreground" onClick={() => clearTranslation(msg.id)}>
            {t("translation.viewOriginal")}
          </Button>
        )}
      </div>
      <p className="text-foreground">{translation ? translation.translated_text : msg.content}</p>
      {translation && <p className="text-xs text-muted-foreground italic">{msg.content}</p>}
      {msg.attachment_url && (
        <div className="mt-1">
          {isImage ? (
            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
              <img src={msg.attachment_url} alt="Attachment" className="max-w-[200px] max-h-[150px] rounded-md border object-cover" />
            </a>
          ) : (
            <a
              href={msg.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline border rounded-md px-2 py-1"
            >
              <File className="h-3 w-3" />
              {msg.attachment_type?.includes("pdf") ? "PDF Document" : "Attachment"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function MessagesTab({ messages, bookingId }: { messages: any[]; bookingId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role } = useAuth();
  const createMessage = useCreateMessage();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [attachment, setAttachment] = useState<{ url: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { translations, translate, clearTranslation, isTranslating } = useMessageTranslation();
  const { profile: { data: profileData } } = useProfile();
  const preferredLang = profileData?.preferred_language ?? "en";
  const { isAIEnabled } = useAISettings(role);
  const aiAssistant = useAIAssistant();

  const handleDraftWithAI = async () => {
    const lastMessages = messages.slice(-5).map((m: any) => `[${m.is_internal ? "internal" : "guest"}] ${m.content}`).join("\n");
    const ctx = { bookingId, recentMessages: lastMessages };
    await aiAssistant.sendMessage("Draft a professional reply to the guest based on the recent conversation.", "draft", ctx);
    const lastAI = aiAssistant.messages[aiAssistant.messages.length - 1];
    if (lastAI?.role === "assistant") setContent(lastAI.content);
  };

  // Sync AI draft into textarea when streaming completes
  const lastAIMsg = aiAssistant.messages[aiAssistant.messages.length - 1];
  const prevStreamingRef = useRef(false);
  if (prevStreamingRef.current && !aiAssistant.isStreaming && lastAIMsg?.role === "assistant" && content === "") {
    setContent(lastAIMsg.content);
  }
  prevStreamingRef.current = aiAssistant.isStreaming;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const filePath = `${bookingId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("guest-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("guest-documents")
        .getPublicUrl(filePath);
      // guest-documents is private, use signed URL
      const { data: signedData } = await supabase.storage
        .from("guest-documents")
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days
      setAttachment({
        url: signedData?.signedUrl ?? urlData.publicUrl,
        type: file.type,
      });
      if (!content.trim()) {
        setContent(`📎 ${file.name}`);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!permissions.canSendMessages(role)) {
    return (
      <div className="py-3">
        {messages.length > 0 ? (
          <ScrollArea className="max-h-[250px]"><div className="space-y-3">{messages.map((m) => (
            <MessageBubble key={m.id} msg={m} translate={translate} clearTranslation={clearTranslation} translations={translations} isTranslating={isTranslating} preferredLang={preferredLang} />
          ))}</div></ScrollArea>
        ) : <p className="text-sm text-muted-foreground">{t("messages.noMessages")}</p>}
      </div>
    );
  }

  const handleSend = async () => {
    if (!content.trim() && !attachment) return;
    try {
      await createMessage.mutateAsync({
        booking_id: bookingId,
        content: content.trim() || "📎 Attachment",
        is_internal: isInternal,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
      });
      setContent("");
      setAttachment(null);
    }
    catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4 py-3">
      {messages.length > 0 ? (
        <ScrollArea className="max-h-[250px]"><div className="space-y-3">{messages.map((m) => (
          <MessageBubble key={m.id} msg={m} translate={translate} clearTranslation={clearTranslation} translations={translations} isTranslating={isTranslating} preferredLang={preferredLang} />
        ))}</div></ScrollArea>
      ) : <p className="text-sm text-muted-foreground">{t("messages.noMessages")}</p>}
      <Separator />
      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2 py-1.5">
          {attachment.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <File className="h-3 w-3" />}
          <span className="truncate flex-1">{attachment.type.startsWith("image/") ? "Image" : "Document"} attached</span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setAttachment(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      <Textarea placeholder={t("messages.writeNote")} value={content} onChange={(e) => setContent(e.target.value)} rows={2} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="is_internal" checked={isInternal} onCheckedChange={setIsInternal} />
          <Label htmlFor="is_internal" className="text-xs text-muted-foreground">{isInternal ? t("messages.internalNote") : t("messages.guestVisible")}</Label>
        </div>
        <div className="flex items-center gap-2">
          {/* Attach file */}
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,.pdf,.doc,.docx" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          </Button>
          {isAIEnabled && (
            <Button variant="outline" size="sm" onClick={handleDraftWithAI} disabled={aiAssistant.isStreaming}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />{aiAssistant.isStreaming ? t("ai.drafting") : t("ai.draftWithAI")}
            </Button>
          )}
          <Button size="sm" onClick={handleSend} disabled={(!content.trim() && !attachment) || createMessage.isPending}>{t("messages.send")}</Button>
        </div>
      </div>
    </div>
  );
}

function BookingSupportTab({ bookingId, maintenanceRequests, laundryRequests, role }: {
  bookingId: string;
  maintenanceRequests: any[];
  laundryRequests: any[];
  role: any;
}) {
  const { t } = useTranslation();
  const updateMaintenance = useUpdateMaintenanceStatus();
  const advanceLaundry = useAdvanceLaundryStatus();
  const canResolve = permissions.canResolveMaintenanceRequest(role);
  const canUpdateMaintenance = permissions.canUpdateMaintenanceStatus(role);
  const canUpdateLaundry = permissions.canUpdateLaundryStatus(role);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const handleStart = async (req: any) => {
    try {
      await updateMaintenance.mutateAsync({ id: req.id, booking_id: bookingId, from_status: "open", to_status: "in_progress" });
    } catch (err: any) { sonnerToast.error(err.message); }
  };

  const handleResolve = async (req: any) => {
    if (!resolutionNote.trim()) return;
    try {
      await updateMaintenance.mutateAsync({ id: req.id, booking_id: bookingId, from_status: req.status, to_status: "resolved", resolution_note: resolutionNote.trim() });
      setResolvingId(null); setResolutionNote("");
    } catch (err: any) { sonnerToast.error(err.message); }
  };

  const handleAdvanceLaundry = async (req: any) => {
    try {
      await advanceLaundry.mutateAsync({ id: req.id, booking_id: bookingId, current_status: req.status });
    } catch (err: any) { sonnerToast.error(err.message); }
  };

  return (
    <div className="space-y-4 py-3">
      <h4 className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4" /> {t("staySupport.roomIssues")}</h4>
      {maintenanceRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("staySupport.noIssues")}</p>
      ) : (
        <div className="space-y-2">
          {maintenanceRequests.map((req) => (
            <div key={req.id} className="border rounded-md p-2 space-y-1 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{t(`staySupport.categories.${req.category}`)}</Badge>
                <Badge className={`text-xs ${req.status === "open" ? "bg-amber-100 text-amber-800" : req.status === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>
                  {t(`staySupport.statuses.${req.status}`)}
                </Badge>
              </div>
              <p className="text-foreground line-clamp-2">{req.description}</p>
              {canUpdateMaintenance && req.status === "open" && (
                <Button size="sm" variant="outline" onClick={() => handleStart(req)} className="text-xs h-7">{t("staySupport.start")}</Button>
              )}
              {canResolve && req.status === "in_progress" && resolvingId !== req.id && (
                <Button size="sm" variant="outline" onClick={() => setResolvingId(req.id)} className="text-xs h-7">{t("staySupport.resolve")}</Button>
              )}
              {resolvingId === req.id && (
                <div className="space-y-1">
                  <Textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder={t("staySupport.resolutionPlaceholder")} rows={2} />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleResolve(req)} className="text-xs h-7">{t("staySupport.confirmResolve")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setResolvingId(null); setResolutionNote(""); }} className="text-xs h-7">{t("common.cancel")}</Button>
                  </div>
                </div>
              )}
              {req.status === "resolved" && req.resolution_note && (
                <p className="text-xs text-muted-foreground italic">{t("staySupport.resolution")}: {req.resolution_note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Separator />

      <h4 className="text-sm font-semibold flex items-center gap-2"><Shirt className="h-4 w-4" /> {t("staySupport.laundry")}</h4>
      {laundryRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("staySupport.noLaundry")}</p>
      ) : (
        <div className="space-y-2">
          {laundryRequests.map((req) => {
            const nextStatus = getNextLaundryStatus(req.status);
            return (
              <div key={req.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${req.status === "ready_for_pickup" ? "bg-blue-100 text-blue-800" : req.status === "collected" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                    {t(`staySupport.statuses.${req.status}`)}
                  </Badge>
                  {req.bag_count && <span className="text-xs text-muted-foreground">{req.bag_count} {t("staySupport.bags")}</span>}
                </div>
                {canUpdateLaundry && nextStatus && (
                  <Button size="sm" variant="outline" onClick={() => handleAdvanceLaundry(req)} className="text-xs h-7">
                    <ArrowRight className="h-3 w-3 mr-1" /> {t(`staySupport.statuses.${nextStatus}`)}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
