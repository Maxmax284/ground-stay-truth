import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Beaker, Radio, Loader2, FlaskConical } from "lucide-react";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

interface BookingOption {
  id: string;
  check_in: string;
  check_out: string;
  state: string;
  guest_id: string | null;
  guest_name: string | null;
  unit_name: string | null;
}

export function MessagingAdminTools() {
  const { toast } = useToast();
  const [testOpen, setTestOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string>("");
  const [message, setMessage] = useState("Hi, I just landed in Bangkok — what now?");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ reply: string; urgency: string | null } | null>(null);
  const [pinging, setPinging] = useState(false);

  // Eligible bookings: upcoming or active, with a guest
  const { data: bookings } = useQuery({
    queryKey: ["admin-test-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in, check_out, state, guest_id, units(name), manual_guest_name, manual_guest_email, manual_guest_phone, profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .in("state", ["confirmed", "pending_deposit", "checked_in"])
        .not("guest_id", "is", null)
        .order("check_in", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
        id: b.id,
        check_in: b.check_in,
        check_out: b.check_out,
        state: b.state,
        guest_id: b.guest_id,
        guest_name: resolveGuestDisplayName(b) || null,
        unit_name: b.units?.name ?? null,
      })) as BookingOption[];
    },
  });

  const handleTest = async () => {
    if (!bookingId || !message.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-messaging-test", {
        body: { booking_id: bookingId, message: message.trim(), channel: "telegram" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Simulation failed");
      setTestResult({ reply: data.reply ?? "(no reply)", urgency: data.urgency ?? null });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handlePing = async () => {
    setPinging(true);
    try {
      const { data, error } = await supabase.functions.invoke("messaging-system-ping", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Ping complete",
        description: `${data.sent} delivered, ${data.failed} failed (of ${data.total} linked).`,
      });
    } catch (err: any) {
      toast({ title: "Ping failed", description: err.message, variant: "destructive" });
    } finally {
      setPinging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Admin Tools</CardTitle>
            <CardDescription>Simulate the guest bot or pulse all linked chats</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
            <Beaker className="h-4 w-4 mr-2" />
            Test as Guest
          </Button>
          <Button variant="outline" size="sm" onClick={handlePing} disabled={pinging}>
            {pinging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Radio className="h-4 w-4 mr-2" />}
            Run System Ping
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          System Ping is rate-limited to once per hour per admin. Test as Guest does not send any real messages — Kru Glitch's response shows in the modal only.
        </p>
      </CardContent>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="h-4 w-4" />
              Test as Guest
              <Badge variant="outline" className="ml-2 text-[10px]">SIMULATION</Badge>
            </DialogTitle>
            <DialogDescription>
              Send a message through Kru Glitch as if it came from the selected guest. No real Telegram or WhatsApp message will be sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Booking</Label>
              <Select value={bookingId} onValueChange={setBookingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a booking…" />
                </SelectTrigger>
                <SelectContent>
                  {(bookings ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b.guest_name || "Guest")} — {b.unit_name || "Unit"} · {b.check_in} → {b.check_out} [{b.state}]
                    </SelectItem>
                  ))}
                  {!bookings?.length && <SelectItem value="__none" disabled>No eligible bookings</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="What would the guest say?"
              />
            </div>
            <Button onClick={handleTest} disabled={!bookingId || !message.trim() || testing} className="w-full">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Run simulation
            </Button>
            {testResult && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Kru Glitch reply</span>
                  {testResult.urgency && (
                    <Badge variant="outline" className="text-[10px]">urgency: {testResult.urgency}</Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{testResult.reply}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
