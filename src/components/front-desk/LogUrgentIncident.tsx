import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneIncoming } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { URGENT_CATEGORIES } from "@/hooks/useUrgentAssistance";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";

const SOURCES = [
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "walk_in", label: "Walk-in" },
  { value: "other", label: "Other" },
];
const NONE = "__none__";

/** Staff logs an urgent call/walk-in against a booking. Alerts train@ + on-duty responder via the normal ladder. */
export function LogUrgentIncident({ bookings }: { bookings: FrontDeskBooking[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bookingId, setBookingId] = useState(NONE);
  const [category, setCategory] = useState(NONE);
  const [source, setSource] = useState("phone");
  const [details, setDetails] = useState("");

  const options = useMemo(() => {
    const seen = new Map<string, FrontDeskBooking>();
    bookings.forEach((b) => seen.set(b.id, b));
    return [...seen.values()];
  }, [bookings]);

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("staff_log_urgent_request" as any, {
        _booking_id: bookingId, _category: category, _source: source, _details: details || null,
      });
      if (error) throw error;
      return data as unknown as { updated_existing: boolean };
    },
    onSuccess: (d) => {
      toast.success(d?.updated_existing ? "Added to the open incident for this guest." : "Logged. Alert sent to train@ and whoever's on duty.");
      qc.invalidateQueries({ queryKey: ["urgent-requests-open"] });
      setOpen(false); setBookingId(NONE); setCategory(NONE); setDetails("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't log incident"),
  });

  if (!open) {
    return (
      <Button variant="destructive" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <PhoneIncoming className="h-4 w-4 mr-2" /> Log urgent call / incident
      </Button>
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardContent className="p-3 space-y-3">
        <div className="text-sm font-semibold">Log urgent guest incident</div>
        <p className="text-xs text-muted-foreground">
          Real incidents only. This emails train@lamaimuaythai.com and the on-duty responder right away, and starts the escalation clock.
        </p>
        <Select value={bookingId} onValueChange={setBookingId}>
          <SelectTrigger><SelectValue placeholder="Guest / room" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} disabled>Pick the guest</SelectItem>
            {options.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {resolveGuestDisplayName(b.profiles as any) || "Guest"} — {b.units?.name ?? "No room"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="What happened" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} disabled>What happened</SelectItem>
              {URGENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Textarea placeholder="What the guest said (optional)" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="destructive" disabled={bookingId === NONE || category === NONE || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Sending…" : "Log & alert"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
