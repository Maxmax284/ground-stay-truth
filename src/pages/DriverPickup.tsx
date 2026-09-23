/**
 * Driver view — the only screen a driver ever sees.
 *
 * Reached by an expiring link for ONE pickup. No login, no menu, no money, no
 * booking reference, no other guests. One action: "Guest is in the car".
 * A landed plane is stated plainly as a landed plane, never as a ready guest.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Loader2, MapPin, MessageCircle, Phone, Plane, RefreshCw, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { meetingPointFor } from "@/lib/meetingPoints";

interface DriverMessage { id: string; sender_type: "driver" | "guest" | "staff"; content: string; created_at: string; }

interface Brief {
  guest_name: string;
  guest_phone: string | null;
  passenger_count: number | null;
  flight_number: string | null;
  airline_name: string | null;
  airport: string | null;
  location_name: string | null;
  arrival_local: string | null;
  estimated_arrival_local: string | null;
  flight_status: string | null;
  delay_minutes: number;
  terminal: string | null;
  gate: string | null;
  luggage_notes: string | null;
  special_instructions: string | null;
  driver_name: string | null;
  license_plate: string | null;
  vehicle: string | null;
  status: "collected" | "waiting" | "clearing" | "not_landed";
  collected_at: string | null;
  expires_at: string;
}

const STATUS_LINE: Record<Brief["status"], string> = {
  not_landed: "The plane has not landed yet. Nothing to do until we tell you.",
  clearing: "The plane is down. The guest is still clearing immigration and bags — not out yet.",
  waiting: "The guest is out with their bags and waiting for you now.",
  collected: "Collected. Thank you — the camp has been told.",
};

const STATUS_TONE: Record<Brief["status"], string> = {
  not_landed: "bg-muted text-muted-foreground",
  clearing: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  waiting: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  collected: "bg-primary/15 text-primary",
};

export default function DriverPickup() {
  const { token } = useParams<{ token: string }>();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const call = useCallback(
    async (action: "view" | "collected" | "send_message", content?: string) => {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/driver-pickup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ token, action, content }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || "Could not load this pickup");
      return body as { brief?: Brief; messages?: DriverMessage[]; message?: DriverMessage };
    },
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await call("view");
      if (result.brief) setBrief(result.brief);
      setMessages(result.messages ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  const confirmCollected = async () => {
    setSaving(true);
    try {
      const result = await call("collected");
      if (result.brief) setBrief(result.brief);
      toast.success("Thank you — the camp knows the guest is with you.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async (preset?: string) => {
    const content = (preset ?? message).trim();
    if (!content) return;
    setSending(true);
    try {
      const result = await call("send_message", content);
      if (result.message) setMessages((current) => [...current, result.message as DriverMessage]);
      setMessage("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const meeting = brief ? meetingPointFor(brief.airport) : null;
  const whatsappLink = brief?.guest_phone
    ? `https://wa.me/${brief.guest_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${brief.guest_name}, this is your LMT pickup driver. I am at ${meeting?.point ?? brief.location_name ?? "the meeting point"}.`)}`
    : null;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wide">LMT CampStay — Pickup</span>
        <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading && !brief && <Skeleton className="h-64 w-full" />}

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      )}

      {brief && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">{brief.guest_name}</CardTitle>
              <div className={`mt-1 rounded-md px-3 py-2 text-sm font-medium ${STATUS_TONE[brief.status]}`}>
                {STATUS_LINE[brief.status]}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    {brief.flight_number ?? "Flight not given"}
                    {brief.airport ? ` → ${brief.airport.toUpperCase()}` : ""}
                  </div>
                  {brief.arrival_local && <div className="text-muted-foreground">Lands {brief.arrival_local} (Thai time)</div>}
                  {brief.estimated_arrival_local && brief.estimated_arrival_local !== brief.arrival_local && (
                    <div className="text-amber-600 dark:text-amber-400">Now expected {brief.estimated_arrival_local}</div>
                  )}
                  {brief.delay_minutes > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">{brief.delay_minutes} min late</div>
                  )}
                  {(brief.terminal || brief.gate) && (
                    <div className="text-muted-foreground">
                      {[brief.terminal ? `Terminal ${brief.terminal}` : null, brief.gate ? `Gate ${brief.gate}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">{meeting?.point ?? brief.location_name ?? "Meeting point to be confirmed"}</div>
                  {meeting?.detail && <div className="text-muted-foreground">{meeting.detail}</div>}
                </div>
              </div>

              {!!brief.passenger_count && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {brief.passenger_count} passenger{brief.passenger_count > 1 ? "s" : ""}
                  {brief.luggage_notes ? ` · ${brief.luggage_notes}` : ""}
                </div>
              )}

              {brief.guest_phone && (
                <a href={`tel:${brief.guest_phone}`} className="flex items-center gap-2 text-primary underline">
                  <Phone className="h-4 w-4" /> {brief.guest_phone}
                </a>
              )}

              {brief.special_instructions && (
                <div className="rounded-md bg-muted p-2 text-muted-foreground">{brief.special_instructions}</div>
              )}

              {(brief.driver_name || brief.license_plate) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {brief.driver_name && <Badge variant="outline">{brief.driver_name}</Badge>}
                  {brief.license_plate && <Badge variant="outline">{brief.license_plate}</Badge>}
                  {brief.vehicle && <Badge variant="outline">{brief.vehicle}</Badge>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-primary" /> Message guest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3" aria-live="polite">
                {messages.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No messages yet.</p> : messages.map((item) => (
                  <div key={item.id} className={`flex ${item.sender_type === "driver" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${item.sender_type === "driver" ? "bg-primary text-primary-foreground" : "border bg-background"}`}>
                      <p className="mb-1 text-[11px] font-semibold opacity-75">{item.sender_type === "guest" ? brief.guest_name : item.sender_type === "staff" ? "Front desk" : "You"}</p>
                      <p className="whitespace-pre-wrap break-words">{item.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["I'm at the meeting point", "Wearing an LMT shirt", "I can see you"].map((text) => (
                  <Button key={text} variant="outline" size="sm" disabled={sending} onClick={() => void sendMessage(text)}>{text}</Button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={2} placeholder="Type a short message…" />
                <Button size="icon" className="h-10 w-10 shrink-0" disabled={!message.trim() || sending} onClick={() => void sendMessage()} aria-label="Send message">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {whatsappLink && <Button variant="outline" className="w-full" asChild><a href={whatsappLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" /> Chat on WhatsApp</a></Button>}
              <p className="text-xs text-muted-foreground">The guest and front desk can see this pickup conversation.</p>
            </CardContent>
          </Card>

          {brief.status === "collected" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" /> Guest collected
            </div>
          ) : (
            <Button className="h-14 w-full text-base" disabled={saving} onClick={confirmCollected}>
              {saving ? "Sending…" : "Guest is in the car"}
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            This link is for this one pickup only and stops working after the job.
          </p>
        </>
      )}
    </div>
  );
}
