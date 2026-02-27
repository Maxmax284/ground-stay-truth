import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useSimulation } from "./SimulationContext";
import { AIActorEngine } from "./AIActorEngine";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, Send, MessageSquare, Wrench, Shirt, Bot } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type BookingState = Database["public"]["Enums"]["booking_state"];

const STATE_COLORS: Record<string, string> = {
  inquiry: "bg-muted text-muted-foreground",
  soft_hold: "bg-warning/15 text-warning-foreground",
  pending_approval: "bg-info/15 text-info-foreground",
  pending_deposit: "bg-accent text-accent-foreground",
  confirmed: "bg-success/15 text-success",
  checked_in: "bg-primary/15 text-primary",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
};

const TRANSITIONS: Record<string, BookingState[]> = {
  inquiry: ["soft_hold", "cancelled"],
  soft_hold: ["pending_approval", "cancelled"],
  pending_approval: ["pending_deposit", "cancelled"],
  pending_deposit: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["completed"],
};

function CreateBookingDialog() {
  const { data, createBooking } = useSimulation();
  const [guestName, setGuestName] = useState("");
  const [unitId, setUnitId] = useState(data.units[0]?.id || "");
  const [numGuests, setNumGuests] = useState("1");
  const [notes, setNotes] = useState("");

  const handleCreate = () => {
    if (!guestName.trim()) return;
    const today = new Date();
    const checkOut = new Date(today);
    checkOut.setDate(checkOut.getDate() + 3);
    createBooking({
      unit_id: unitId,
      guest_id: null,
      guest_name: guestName.trim(),
      check_in: today.toISOString().split("T")[0],
      check_out: checkOut.toISOString().split("T")[0],
      num_guests: parseInt(numGuests) || 1,
      state: "inquiry",
      total_price: null,
      notes: notes.trim() || null,
      pre_arrival_status: "pending",
    });
    setGuestName("");
    setNotes("");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3 w-3 mr-1" /> New Booking
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Mock Booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min={1} max={10} placeholder="# guests" value={numGuests} onChange={(e) => setNumGuests(e.target.value)} />
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button onClick={handleCreate} disabled={!guestName.trim()}>Create Inquiry</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingCard({ booking }: { booking: import("./mockData").MockBooking }) {
  const { transitionBooking, data } = useSimulation();
  const unit = data.units.find((u) => u.id === booking.unit_id);
  const nextStates = TRANSITIONS[booking.state] || [];

  return (
    <Card className="hover-lift">
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-sm">{booking.guest_name}</CardTitle>
          <p className="text-xs text-muted-foreground">{unit?.name || "Unknown"}</p>
        </div>
        <Badge className={cn("text-[10px]", STATE_COLORS[booking.state])}>
          {booking.state.replace(/_/g, " ")}
        </Badge>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="text-xs text-muted-foreground">
          {booking.check_in} → {booking.check_out} · {booking.num_guests} guest(s)
        </div>
        {booking.total_price && (
          <div className="text-xs font-medium">฿{booking.total_price.toLocaleString()}</div>
        )}
        {booking.notes && (
          <p className="text-xs text-muted-foreground italic truncate">{booking.notes}</p>
        )}
        {nextStates.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {nextStates.map((ns) => (
              <Button
                key={ns}
                size="sm"
                variant={ns === "cancelled" || ns === "no_show" ? "destructive" : "outline"}
                className="text-[10px] h-6 px-2"
                onClick={() => transitionBooking(booking.id, ns)}
              >
                <ArrowRight className="h-2.5 w-2.5 mr-0.5" />
                {ns.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MessagesPanel() {
  const { data, sendMessage } = useSimulation();
  const [selectedBookingId, setSelectedBookingId] = useState(data.bookings[0]?.id || "");
  const [newMsg, setNewMsg] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const bookingMessages = data.messages.filter((m) => m.booking_id === selectedBookingId);
  const booking = data.bookings.find((b) => b.id === selectedBookingId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" /> Messages
          </CardTitle>
          <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
            <SelectTrigger className="w-[180px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.bookings.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">{b.guest_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2 bg-muted/30">
          {bookingMessages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No messages yet</p>
          )}
          {bookingMessages.map((msg) => {
            const isAIActor = msg.sender_id?.startsWith("ai-actor-");
            const actorType = isAIActor ? msg.sender_id!.replace("ai-actor-", "") : null;
            const isGuest = msg.sender_id?.includes("guest");
            const actorLabels: Record<string, string> = {
              guest: "Guest AI",
              supervisor: "Supervisor AI",
              maintenance: "Maintenance AI",
              "front-desk": "Front Desk AI",
            };
            return (
              <div key={msg.id} className={cn(
                "text-xs p-2 rounded-md",
                msg.is_internal ? "bg-warning/10 border border-warning/20" : "bg-background border",
                isAIActor ? "border-primary/30 bg-primary/5" : "",
                isGuest && !isAIActor ? "ml-0 mr-8" : !isGuest && !isAIActor ? "ml-8 mr-0" : isAIActor && isGuest ? "ml-0 mr-8" : "ml-8 mr-0"
              )}>
                <div className="flex items-center gap-1 mb-0.5">
                  {isAIActor && <Bot className="h-3 w-3 text-primary shrink-0" />}
                  <span className="font-medium">
                    {isAIActor
                      ? actorLabels[actorType!] || "AI Actor"
                      : isGuest
                        ? booking?.guest_name || "Guest"
                        : "Staff"}
                  </span>
                  {msg.is_internal && <Badge variant="outline" className="text-[8px] px-1">Internal</Badge>}
                  {isAIActor && <Badge variant="outline" className="text-[8px] px-1 border-primary/30 text-primary">AI</Badge>}
                </div>
                {msg.content}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Type a message…"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            className="text-xs h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newMsg.trim()) {
                sendMessage({ booking_id: selectedBookingId, sender_id: "sim-staff-1", content: newMsg.trim(), is_internal: isInternal });
                setNewMsg("");
              }
            }}
          />
          <Button
            size="sm"
            variant={isInternal ? "secondary" : "default"}
            className="h-8 text-xs shrink-0"
            onClick={() => setIsInternal(!isInternal)}
          >
            {isInternal ? "Internal" : "Guest"}
          </Button>
          <Button
            size="sm"
            className="h-8 shrink-0"
            disabled={!newMsg.trim()}
            onClick={() => {
              sendMessage({ booking_id: selectedBookingId, sender_id: "sim-staff-1", content: newMsg.trim(), is_internal: isInternal });
              setNewMsg("");
            }}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MaintenancePanel() {
  const { data, updateMaintenanceStatus } = useSimulation();
  const statusFlow = ["open", "in_progress", "resolved"];

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5" /> Maintenance ({data.maintenanceRequests.length})
      </h3>
      <div className="space-y-2">
        {data.maintenanceRequests.map((req) => {
          const currentIdx = statusFlow.indexOf(req.status);
          const nextStatus = currentIdx < statusFlow.length - 1 ? statusFlow[currentIdx + 1] : null;
          return (
            <Card key={req.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{req.description}</p>
                  <p className="text-xs text-muted-foreground">{req.category} · {req.priority} priority</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px]">{req.status.replace(/_/g, " ")}</Badge>
                  {nextStatus && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => updateMaintenanceStatus(req.id, nextStatus)}>
                      → {nextStatus.replace(/_/g, " ")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LaundryPanel() {
  const { data, updateLaundryStatus } = useSimulation();
  const statusFlow = ["pending", "received", "in_progress", "ready_for_pickup", "delivered"];

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Shirt className="h-3.5 w-3.5" /> Laundry ({data.laundryRequests.length})
      </h3>
      <div className="space-y-2">
        {data.laundryRequests.map((req) => {
          const currentIdx = statusFlow.indexOf(req.status);
          const nextStatus = currentIdx < statusFlow.length - 1 ? statusFlow[currentIdx + 1] : null;
          return (
            <Card key={req.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{req.bag_count} bag(s)</p>
                  <p className="text-xs text-muted-foreground">{req.note || "No notes"}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px]">{req.status.replace(/_/g, " ")}</Badge>
                  {nextStatus && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => updateLaundryStatus(req.id, nextStatus)}>
                      → {nextStatus.replace(/_/g, " ")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function SimulationSandbox() {
  const { data } = useSimulation();

  return (
    <div className="space-y-6">
      {/* AI Actor Engine */}
      <AIActorEngine />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Mock Units ({data.units.length})
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.units.map((unit) => {
            const unitBookings = data.bookings.filter((b) => b.unit_id === unit.id && !["completed", "cancelled", "no_show"].includes(b.state));
            return (
              <Card key={unit.id} className="hover-lift">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{unit.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{unit.capacity} guests · ฿{unit.base_price}/night</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {unitBookings.map((b) => (
                      <Badge key={b.id} variant="outline" className="text-[9px]">
                        {b.state.replace(/_/g, " ")}
                      </Badge>
                    ))}
                    {unitBookings.length === 0 && (
                      <span className="text-xs text-muted-foreground">No active bookings</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bookings Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Mock Bookings ({data.bookings.length})
          </h3>
          <CreateBookingDialog />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      </div>

      {/* Messages */}
      <MessagesPanel />

      {/* Maintenance & Laundry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MaintenancePanel />
        <LaundryPanel />
      </div>
    </div>
  );
}
