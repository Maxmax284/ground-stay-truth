import { useState, useMemo } from "react";
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
import {
  useBooking,
  useBookingStateLog,
  useBookingPayments,
  useBookingMessages,
  useCreatePayment,
  useCreateMessage,
} from "@/hooks/useBookings";
import { BookingStateTransition } from "@/components/BookingStateTransition";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { STATE_LABELS, STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { CalendarDays, CreditCard, MessageSquare, History, ArrowRight, AlertTriangle, User, FileText, Info } from "lucide-react";
import { GuestDocumentUpload } from "@/components/GuestDocumentUpload";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";

interface BookingDetailSheetProps {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

export function BookingDetailSheet({ bookingId, open, onOpenChange, isAdmin }: BookingDetailSheetProps) {
  const { role } = useAuth();
  const { data: booking } = useBooking(bookingId);
  const { data: stateLog } = useBookingStateLog(bookingId);
  const { data: payments } = useBookingPayments(bookingId);
  const { data: messages } = useBookingMessages(bookingId);
  const { data: policies } = usePolicySettings();
  const { data: documents } = useGuestDocuments(bookingId ?? "");

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

  const nextStep = useMemo(() => {
    if (!booking) return null;
    const state = booking.state as BookingState;
    const hasDocuments = (documents?.length ?? 0) > 0;
    const hasPaid = (payments?.length ?? 0) > 0;

    switch (state) {
      case "inquiry": return "Advance to Soft Hold or Pending Approval";
      case "soft_hold": return softHoldInfo?.isExpired ? "Soft hold expired — cancel or advance" : "Confirm or cancel this hold";
      case "pending_approval": return "Review and approve or decline";
      case "pending_deposit": return depositDeadlineInfo?.isExpired ? "Deposit overdue — record payment or cancel" : hasPaid ? "Deposit recorded — advance to Confirmed" : "Record deposit payment";
      case "confirmed": return !hasDocuments ? "Upload ID documents before check-in" : "Ready for check-in";
      case "checked_in": return "Complete check-out when guest departs";
      default: return null;
    }
  }, [booking, documents, payments, softHoldInfo, depositDeadlineInfo]);

  if (!booking) return null;

  const guestName = (booking as any).profiles?.full_name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            <span>{booking.units?.name ?? "Unknown Unit"}</span>
            <Badge className={STATE_VARIANTS[booking.state as BookingState]}>
              {STATE_LABELS[booking.state as BookingState]}
            </Badge>
          </SheetTitle>
          {guestName && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{guestName}</span>
            </div>
          )}
          {softHoldInfo && (
            <div className={`flex items-center gap-2 text-sm ${softHoldInfo.isExpired ? "text-destructive" : "text-warning-foreground"}`}>
              <AlertTriangle className="h-4 w-4" />
              {softHoldInfo.isExpired
                ? "This soft hold has expired and should be cancelled or advanced."
                : `Soft hold expires in ${softHoldInfo.remaining} hour${softHoldInfo.remaining !== 1 ? "s" : ""}.`
              }
            </div>
          )}
          {depositDeadlineInfo && (
            <div className={`flex items-center gap-2 text-sm ${depositDeadlineInfo.isExpired ? "text-destructive" : "text-warning-foreground"}`}>
              <AlertTriangle className="h-4 w-4" />
              {depositDeadlineInfo.isExpired
                ? "Deposit deadline has passed — cancel or record payment."
                : `Deposit deadline in ${depositDeadlineInfo.remaining} hour${depositDeadlineInfo.remaining !== 1 ? "s" : ""}.`
              }
            </div>
          )}
          {nextStep && (
            <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-md px-3 py-2">
              <Info className="h-4 w-4 shrink-0" />
              <span><strong>Next:</strong> {nextStep}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span>{format(new Date(booking.check_in), "MMM d, yyyy")}</span>
            <ArrowRight className="h-3 w-3" />
            <span>{format(new Date(booking.check_out), "MMM d, yyyy")}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {booking.num_guests} guest{booking.num_guests !== 1 ? "s" : ""}
            {booking.notes && <span className="block mt-1 italic">"{booking.notes}"</span>}
          </div>
        </SheetHeader>

        <Separator />

        <div className="py-4">
          <BookingStateTransition
            bookingId={booking.id}
            currentState={booking.state as BookingState}
            isAdmin={isAdmin}
            checkInDate={booking.check_in}
            totalPrice={booking.total_price}
          />
        </div>

        <Tabs defaultValue="history" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1"><History className="h-4 w-4 mr-1" /> History</TabsTrigger>
            <TabsTrigger value="payments" className="flex-1"><CreditCard className="h-4 w-4 mr-1" /> Payments</TabsTrigger>
            <TabsTrigger value="messages" className="flex-1"><MessageSquare className="h-4 w-4 mr-1" /> Notes</TabsTrigger>
            <TabsTrigger value="documents" className="flex-1"><FileText className="h-4 w-4 mr-1" /> ID</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <StateHistoryTab logs={stateLog ?? []} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsTab
              payments={payments ?? []}
              bookingId={booking.id}
              canSeeAmounts={canSeeAmounts}
              canRecord={canRecordPay}
            />
          </TabsContent>

          <TabsContent value="messages">
            <MessagesTab messages={messages ?? []} bookingId={booking.id} />
          </TabsContent>

          <TabsContent value="documents">
            <div className="py-3">
              <GuestDocumentUpload
                bookingId={booking.id}
                showRequirement={["confirmed", "checked_in"].includes(booking.state)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ── State History Tab ──
function StateHistoryTab({ logs }: { logs: any[] }) {
  if (logs.length === 0) return <p className="text-sm text-muted-foreground py-4">No history yet.</p>;

  return (
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-3 py-3">
        {logs.map((log) => {
          const isSystem = !log.changed_by;
          const isAdminOverride = log.reason?.startsWith("[ADMIN OVERRIDE]");
          const dotColor = isAdminOverride
            ? "bg-destructive"
            : isSystem
            ? "bg-muted-foreground"
            : "bg-primary";

          return (
            <div key={log.id} className="flex items-start gap-3 text-sm">
              <div className={`mt-1 h-2 w-2 rounded-full ${dotColor} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {log.from_state && (
                    <>
                      <Badge variant="outline" className="text-xs">{STATE_LABELS[log.from_state as BookingState]}</Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </>
                  )}
                  <Badge variant="outline" className="text-xs">{STATE_LABELS[log.to_state as BookingState]}</Badge>
                  {isAdminOverride && (
                    <Badge variant="destructive" className="text-xs ml-1">Admin Override</Badge>
                  )}
                  {isSystem && !isAdminOverride && (
                    <Badge variant="secondary" className="text-xs ml-1">System</Badge>
                  )}
                </div>
                {log.reason && <p className="text-muted-foreground mt-1">{log.reason}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                  {log.changed_by_name && (
                    <span className="text-xs text-muted-foreground">— {log.changed_by_name}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ── Payments Tab ──
function PaymentsTab({
  payments,
  bookingId,
  canSeeAmounts,
  canRecord,
}: {
  payments: any[];
  bookingId: string;
  canSeeAmounts: boolean;
  canRecord: boolean;
}) {
  const { toast } = useToast();
  const createPayment = useCreatePayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("offline");
  const [notes, setNotes] = useState("");

  const handleRecord = async () => {
    if (!amount || Number(amount) <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    try {
      await createPayment.mutateAsync({
        booking_id: bookingId,
        amount: Number(amount),
        method,
        notes: notes || undefined,
      });
      toast({ title: "Payment recorded" });
      setAmount("");
      setNotes("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 py-3">
      {payments.length > 0 ? (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border rounded-md p-3">
                <div>
                  {canSeeAmounts ? (
                    <span className="font-medium">${Number(p.amount).toFixed(2)}</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {Number(p.amount) > 0 ? "Paid" : "Unpaid"}
                    </Badge>
                  )}
                  {canSeeAmounts && (
                    <span className="text-muted-foreground ml-2">({p.method})</span>
                  )}
                  {p.notes && canSeeAmounts && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d")}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground">No payments recorded.</p>
      )}

      {canRecord && (
        <>
          <Separator />
          <h4 className="text-sm font-semibold">Record Payment</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount *</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea placeholder="Payment notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <Button size="sm" onClick={handleRecord} disabled={createPayment.isPending} className="w-full">
            {createPayment.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </>
      )}
    </div>
  );
}

// ── Messages Tab ──
function MessagesTab({ messages, bookingId }: { messages: any[]; bookingId: string }) {
  const { toast } = useToast();
  const { role } = useAuth();
  const createMessage = useCreateMessage();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(true);

  if (!permissions.canSendMessages(role)) {
    return (
      <div className="py-3">
        {messages.length > 0 ? (
          <ScrollArea className="max-h-[250px]">
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={m.is_internal ? "secondary" : "outline"} className="text-xs">
                      {m.is_internal ? "Internal" : "Guest-visible"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(m.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="text-foreground">{m.content}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        )}
      </div>
    );
  }

  const handleSend = async () => {
    if (!content.trim()) return;
    try {
      await createMessage.mutateAsync({
        booking_id: bookingId,
        content: content.trim(),
        is_internal: isInternal,
      });
      setContent("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 py-3">
      {messages.length > 0 ? (
        <ScrollArea className="max-h-[250px]">
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={m.is_internal ? "secondary" : "outline"} className="text-xs">
                    {m.is_internal ? "Internal" : "Guest-visible"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(m.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
                <p className="text-foreground">{m.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      )}

      <Separator />
      <Textarea
        placeholder="Write a note…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="is_internal" checked={isInternal} onCheckedChange={setIsInternal} />
          <Label htmlFor="is_internal" className="text-xs text-muted-foreground">
            {isInternal ? "Internal note" : "Guest-visible"}
          </Label>
        </div>
        <Button size="sm" onClick={handleSend} disabled={!content.trim() || createMessage.isPending}>
          Send
        </Button>
      </div>
    </div>
  );
}
