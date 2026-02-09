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
import { CalendarDays, CreditCard, MessageSquare, History, ArrowRight, AlertTriangle, User } from "lucide-react";

interface BookingDetailSheetProps {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

export function BookingDetailSheet({ bookingId, open, onOpenChange, isAdmin }: BookingDetailSheetProps) {
  const { data: booking } = useBooking(bookingId);
  const { data: stateLog } = useBookingStateLog(bookingId);
  const { data: payments } = useBookingPayments(bookingId);
  const { data: messages } = useBookingMessages(bookingId);
  const { data: policies } = usePolicySettings();

  const softHoldInfo = useMemo(() => {
    if (!booking || (booking.state as BookingState) !== "soft_hold") return null;
    const expiryHours = policies?.find((p) => p.key === "soft_hold_expiration_hours");
    const hours = expiryHours ? Number(expiryHours.value) : 12;
    const elapsed = differenceInHours(new Date(), new Date(booking.created_at));
    return { isExpired: elapsed >= hours, remaining: hours - elapsed, hours };
  }, [booking, policies]);

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
          />
        </div>

        <Tabs defaultValue="history" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1"><History className="h-4 w-4 mr-1" /> History</TabsTrigger>
            <TabsTrigger value="payments" className="flex-1"><CreditCard className="h-4 w-4 mr-1" /> Payments</TabsTrigger>
            <TabsTrigger value="messages" className="flex-1"><MessageSquare className="h-4 w-4 mr-1" /> Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <StateHistoryTab logs={stateLog ?? []} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsTab payments={payments ?? []} bookingId={booking.id} />
          </TabsContent>

          <TabsContent value="messages">
            <MessagesTab messages={messages ?? []} bookingId={booking.id} />
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
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 text-sm">
            <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                {log.from_state && (
                  <>
                    <Badge variant="outline" className="text-xs">{STATE_LABELS[log.from_state as BookingState]}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
                <Badge variant="outline" className="text-xs">{STATE_LABELS[log.to_state as BookingState]}</Badge>
              </div>
              {log.reason && <p className="text-muted-foreground mt-1">{log.reason}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ── Payments Tab ──
function PaymentsTab({ payments, bookingId }: { payments: any[]; bookingId: string }) {
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
                  <span className="font-medium">${Number(p.amount).toFixed(2)}</span>
                  <span className="text-muted-foreground ml-2">({p.method})</span>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d")}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground">No payments recorded.</p>
      )}

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
    </div>
  );
}

// ── Messages Tab ──
function MessagesTab({ messages, bookingId }: { messages: any[]; bookingId: string }) {
  const { toast } = useToast();
  const createMessage = useCreateMessage();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(true);

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
