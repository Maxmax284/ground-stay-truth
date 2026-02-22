import { useState, useMemo, useRef } from "react";
import { toast as sonnerToast } from "sonner";
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
import { useBooking, useBookingStateLog, useBookingPayments, useBookingMessages, useCreatePayment, useCreateMessage, useMarkMessagesRead } from "@/hooks/useBookings";
import { BookingStateTransition } from "@/components/BookingStateTransition";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { formatPrice } from "@/lib/currency";
import { CalendarDays, CreditCard, MessageSquare, History, ArrowRight, AlertTriangle, User, FileText, Info, Wrench, Shirt, Globe, Sparkles } from "lucide-react";
import { GuestDocumentUpload } from "@/components/GuestDocumentUpload";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import { useMaintenanceRequests, useUpdateMaintenanceStatus } from "@/hooks/useMaintenanceRequests";
import { useLaundryRequests, useAdvanceLaundryStatus, getNextLaundryStatus } from "@/hooks/useLaundryRequests";
import { StaySupportBadge } from "@/components/StaySupportBadge";
import { useMessageTranslation } from "@/hooks/useMessageTranslation";
import { useProfile } from "@/hooks/useProfile";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { useAISettings } from "@/hooks/useAISettings";
import { useBookingReview } from "@/hooks/useReviews";

interface BookingDetailSheetProps { bookingId: string | null; open: boolean; onOpenChange: (open: boolean) => void; isAdmin: boolean; }

export function BookingDetailSheet({ bookingId, open, onOpenChange, isAdmin }: BookingDetailSheetProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { data: booking } = useBooking(bookingId);
  const guestId = (booking as any)?.guest_id;
  const { data: guestHistory } = useGuestHistory(guestId);
  const { data: stateLog } = useBookingStateLog(bookingId);
  const { data: payments } = useBookingPayments(bookingId);
  const { data: messages } = useBookingMessages(bookingId);
  const { data: policies } = usePolicySettings();
  const { data: documents } = useGuestDocuments(bookingId ?? "");
  const markRead = useMarkMessagesRead();

  const canSeeAmounts = permissions.canViewPaymentAmounts(role);
  const canRecordPay = permissions.canRecordPayment(role);

  const softHoldInfo = useMemo(() => {
    if (!booking || (booking.state as BookingState) !== "soft_hold") return null;
    const expiryHours = policies?.find((p) => p.key === "soft_hold_expiration_hours");
    const hours = expiryHours ? Number(expiryHours.value) : 12;
    const elapsed = differenceInHours(new Date(), new Date(booking.created_at));
    return { isExpired: elapsed >= hours, remaining: hours - elapsed, hours };
  }, [booking, policies]);

  const depositDeadlineInfo = useMemo(() => {
    if (!booking || (booking.state as BookingState) !== "pending_deposit") return null;
    const deadlineSetting = policies?.find((p) => p.key === "deposit_deadline_hours");
    const hours = deadlineSetting ? Number(deadlineSetting.value) : 24;
    const elapsed = differenceInHours(new Date(), new Date(booking.updated_at));
    return { isExpired: elapsed >= hours, remaining: hours - elapsed, hours };
  }, [booking, policies]);

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
      case "confirmed": return !hasDocuments ? t("bookingDetail.nextSteps.docsNeeded") : t("bookingDetail.nextSteps.readyCheckin");
      case "checked_in": {
        const base = t("bookingDetail.nextSteps.checkout");
        return supportAlerts.length > 0 ? `${base} · ${supportAlerts.join(" · ")}` : base;
      }
      default: return null;
    }
  }, [booking, documents, payments, softHoldInfo, depositDeadlineInfo, openMaintenanceCount, laundryReadyCount, t]);

  if (!booking) return null;
  const guestName = (booking as any).profiles?.full_name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            <span>{booking.units?.name ?? t("bookingDetail.unknownUnit")}</span>
            <Badge className={STATE_VARIANTS[booking.state as BookingState]}>{t(`states.${booking.state}`)}</Badge>
            {isCheckedIn && <StaySupportBadge bookingId={booking.id} />}
          </SheetTitle>
          {guestName && <div className="flex items-center gap-2 text-sm text-foreground"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{guestName}</span>{guestHistory?.isReturning && <Badge variant="secondary" className="text-[10px]">{t("loyalty.returningGuest", { count: (guestHistory.completedStays ?? 0) + 1 })}</Badge>}{isCompleted && (bookingReview ? <Badge className={`text-[10px] ${bookingReview.status === "approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : bookingReview.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>{t("reviews.reviewStatus", { defaultValue: "Review" })}: {t(`reviews.${bookingReview.status}`)}</Badge> : <span className="text-xs text-muted-foreground">{t("reviews.noReviewSubmitted", { defaultValue: "No review submitted" })}</span>)}</div>}
          {softHoldInfo && (
            <div className={`flex items-center gap-2 text-sm ${softHoldInfo.isExpired ? "text-destructive" : "text-warning-foreground"}`}>
              <AlertTriangle className="h-4 w-4" />
              {softHoldInfo.isExpired ? t("bookingDetail.softHoldExpired") : t("bookingDetail.softHoldExpires", { hours: softHoldInfo.remaining })}
            </div>
          )}
          {depositDeadlineInfo && (
            <div className={`flex items-center gap-2 text-sm ${depositDeadlineInfo.isExpired ? "text-destructive" : "text-warning-foreground"}`}>
              <AlertTriangle className="h-4 w-4" />
              {depositDeadlineInfo.isExpired ? t("bookingDetail.depositExpired") : t("bookingDetail.depositExpires", { hours: depositDeadlineInfo.remaining })}
            </div>
          )}
          {nextStep && <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-md px-3 py-2"><Info className="h-4 w-4 shrink-0" /><span><strong>{t("common.next")}:</strong> {nextStep}</span></div>}
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /><span>{format(new Date(booking.check_in), "MMM d, yyyy")}</span><ArrowRight className="h-3 w-3" /><span>{format(new Date(booking.check_out), "MMM d, yyyy")}</span></div>
          <div className="text-sm text-muted-foreground">
            {t("bookings.guestCount", { count: booking.num_guests })}
            {booking.guest_type && <Badge variant="outline" className="ml-2 text-xs">{t(`guestBooking.guestTypes.${booking.guest_type}`, { defaultValue: booking.guest_type })}</Badge>}
            {booking.notes && <span className="block mt-1 italic">"{booking.notes}"</span>}
          </div>
          {booking.arrival_details && typeof booking.arrival_details === "object" && Object.keys(booking.arrival_details).length > 0 && (
            <div className="text-sm space-y-1 bg-muted/30 rounded-md p-2">
              <p className="font-medium text-xs text-muted-foreground">{t("guestBooking.arrivalDetails")}</p>
              {(booking.arrival_details as any).flight_info && <p className="text-xs">✈️ {(booking.arrival_details as any).flight_info}</p>}
              {(booking.arrival_details as any).arrival_time && <p className="text-xs">🕐 {(booking.arrival_details as any).arrival_time}</p>}
              {(booking.arrival_details as any).emergency_contact && <p className="text-xs">🚨 {(booking.arrival_details as any).emergency_contact}</p>}
              {(booking.arrival_details as any).dietary_restrictions && <p className="text-xs">🍽️ {(booking.arrival_details as any).dietary_restrictions}</p>}
            </div>
          )}
        </SheetHeader>
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
            {isCheckedIn && (
              <TabsTrigger value="support" className="flex-1"><Wrench className="h-4 w-4 mr-1" /> {t("staySupport.tabLabel")}</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="history"><StateHistoryTab logs={stateLog ?? []} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab payments={payments ?? []} bookingId={booking.id} canSeeAmounts={canSeeAmounts} canRecord={canRecordPay} policies={policies} /></TabsContent>
          <TabsContent value="messages"><MessagesTab messages={messages ?? []} bookingId={booking.id} /></TabsContent>
          <TabsContent value="documents"><div className="py-3"><GuestDocumentUpload bookingId={booking.id} showRequirement={["confirmed", "checked_in"].includes(booking.state)} /></div></TabsContent>
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
                  <p className="text-xs text-muted-foreground">{format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
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

function PaymentsTab({ payments, bookingId, canSeeAmounts, canRecord, policies }: { payments: any[]; bookingId: string; canSeeAmounts: boolean; canRecord: boolean; policies?: any[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createPayment = useCreatePayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const handleRecord = async () => {
    if (!amount || Number(amount) <= 0) { toast({ title: t("payments.enterValidAmount"), variant: "destructive" }); return; }
    try {
      await createPayment.mutateAsync({ booking_id: bookingId, amount: Number(amount), method, notes: notes || undefined });
      toast({ title: t("payments.paymentRecorded") }); setAmount(""); setNotes("");
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4 py-3">
      {payments.length > 0 ? (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border rounded-md p-3">
                <div>
                  {canSeeAmounts ? <span className="font-medium">{formatPrice(p.amount, policies)}</span> : <Badge variant="outline" className="text-xs">{Number(p.amount) > 0 ? t("payments.paid") : t("payments.unpaid")}</Badge>}
                  {canSeeAmounts && <span className="text-muted-foreground ml-2">({t(`payments.methods.${p.method}`)})</span>}
                  {canSeeAmounts && p.source_channel && p.source_channel !== "front_desk" && (
                    <Badge variant="secondary" className="text-[10px] ml-2">{t(`deposit.channels.${p.source_channel}`, { defaultValue: p.source_channel })}</Badge>
                  )}
                  {p.notes && canSeeAmounts && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d")}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : <p className="text-sm text-muted-foreground">{t("payments.noPayments")}</p>}
      {canRecord && (
        <>
          <Separator />
          <h4 className="text-sm font-semibold">{t("payments.recordPayment")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">{t("payments.amount")} *</Label><Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">{t("payments.method")}</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("payments.methods.cash")}</SelectItem>
                  <SelectItem value="card">{t("payments.methods.card")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("payments.methods.bank_transfer")}</SelectItem>
                  <SelectItem value="in_person">{t("payments.methods.in_person")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea placeholder={t("payments.paymentNotes")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <Button size="sm" onClick={handleRecord} disabled={createPayment.isPending} className="w-full">{createPayment.isPending ? t("common.recording") : t("payments.recordPayment")}</Button>
        </>
      )}
    </div>
  );
}

function MessageBubble({ msg, translate, clearTranslation, translations, isTranslating, preferredLang }: { msg: any; translate: any; clearTranslation: any; translations: Record<string, any>; isTranslating: boolean; preferredLang: string }) {
  const { t } = useTranslation();
  const translation = translations[msg.id];
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
    if (!content.trim()) return;
    try { await createMessage.mutateAsync({ booking_id: bookingId, content: content.trim(), is_internal: isInternal }); setContent(""); }
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
      <Textarea placeholder={t("messages.writeNote")} value={content} onChange={(e) => setContent(e.target.value)} rows={2} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Switch id="is_internal" checked={isInternal} onCheckedChange={setIsInternal} /><Label htmlFor="is_internal" className="text-xs text-muted-foreground">{isInternal ? t("messages.internalNote") : t("messages.guestVisible")}</Label></div>
        <div className="flex items-center gap-2">
          {isAIEnabled && (
            <Button variant="outline" size="sm" onClick={handleDraftWithAI} disabled={aiAssistant.isStreaming}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />{aiAssistant.isStreaming ? t("ai.drafting") : t("ai.draftWithAI")}
            </Button>
          )}
          <Button size="sm" onClick={handleSend} disabled={!content.trim() || createMessage.isPending}>{t("messages.send")}</Button>
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
