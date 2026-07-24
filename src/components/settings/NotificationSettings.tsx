// src/components/settings/NotificationSettings.tsx
// -----------------------------------------------------------------------------
// Admin notification preference matrix. Lets admins & managers pick which
// admin-alert events reach them per channel (in-app, email, telegram).
//
// Backing table: `messaging_notification_prefs` — rows keyed by
// (user_id, channel, notification_type). No row for a channel means:
//   - in_app  = ON  (default)
//   - email   = OFF (opt-in)
//   - telegram = OFF (opt-in, requires linked Telegram chat)
// -----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Bell, Mail, Send } from "lucide-react";

type Channel = "in_app" | "email" | "telegram";

interface EventDef {
  key: string;
  label: string;
  description: string;
}

const EVENTS: EventDef[] = [
  { key: "new_booking_request",     label: "New booking request",      description: "Someone submits a new booking or inquiry." },
  { key: "booking_cancelled",       label: "Booking cancelled",        description: "A booking transitions into cancelled state." },
  { key: "airport_pickup_requested",label: "Airport pickup requested", description: "Guest requests airport pickup on their booking." },
  { key: "guest_message_received",  label: "Guest message received",   description: "Guest sends a new (non-internal) message from portal." },
  { key: "deposit_paid",            label: "Deposit paid",             description: "Deposit is recorded via Stripe webhook or manual entry." },
  { key: "balance_paid",            label: "Balance paid",             description: "Full balance is recorded on a booking." },
  { key: "payment_link_failed",     label: "Payment link failed",      description: "Guest attempts to pay but the link fails or expires." },
  { key: "stripe_diagnostics_no_go",label: "Stripe: NO-GO",            description: "Stripe webhook self-test reports a broken pipeline." },
  { key: "webhook_failure",         label: "Webhook failure",          description: "Any inbound webhook (Stripe, Fenrir) fails processing." },
];

const CHANNELS: { key: Channel; label: string; Icon: typeof Bell; defaultOn: boolean }[] = [
  { key: "in_app",   label: "In-app",   Icon: Bell, defaultOn: true  },
  { key: "email",    label: "Email",    Icon: Mail, defaultOn: false },
  { key: "telegram", label: "Telegram", Icon: Send, defaultOn: false },
];

interface PrefRow {
  user_id: string;
  channel: Channel;
  notification_type: string;
  enabled: boolean;
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PrefRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messaging_notification_prefs")
        .select("user_id, channel, notification_type, enabled")
        .eq("user_id", user.id);
      if (error) {
        console.error(error);
        toast.error("Failed to load notification preferences.");
      } else {
        setPrefs((data ?? []) as PrefRow[]);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const enabledFor = useMemo(
    () => (eventKey: string, channel: Channel) => {
      const row = prefs.find((p) => p.notification_type === eventKey && p.channel === channel);
      if (row) return row.enabled;
      return CHANNELS.find((c) => c.key === channel)?.defaultOn ?? false;
    },
    [prefs],
  );

  async function toggle(eventKey: string, channel: Channel, next: boolean) {
    if (!user?.id) return;
    const rowKey = `${eventKey}:${channel}`;
    setSaving(rowKey);
    const { error } = await supabase
      .from("messaging_notification_prefs")
      .upsert(
        { user_id: user.id, channel, notification_type: eventKey, enabled: next },
        { onConflict: "user_id,channel,notification_type" },
      );
    if (error) {
      console.error(error);
      toast.error("Couldn't save that preference.");
    } else {
      setPrefs((prev) => {
        const others = prev.filter((p) => !(p.notification_type === eventKey && p.channel === channel));
        return [...others, { user_id: user.id, channel, notification_type: eventKey, enabled: next }];
      });
      toast.success(`${next ? "On" : "Off"} — ${channel.replace("_", "-")}`);
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <Card className="p-6 space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Admin alerts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick which operational events reach you and how. In-app alerts also fire browser push if you've allowed it.
          Email uses the existing LMT CampStay Resend pipeline. Telegram requires a linked chat.
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(260px,1fr)_repeat(3,120px)] gap-2 px-5 py-3 border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <div>Event</div>
          {CHANNELS.map(({ key, label, Icon }) => (
            <div key={key} className="flex items-center justify-center gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {label}
            </div>
          ))}
        </div>

        <div className="divide-y">
          {EVENTS.map((ev) => (
            <div
              key={ev.key}
              className="grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_repeat(3,120px)] gap-3 md:gap-2 px-5 py-4 items-center"
            >
              <div>
                <div className="font-medium text-sm">{ev.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
              </div>
              {CHANNELS.map(({ key, label, Icon }) => {
                const rowKey = `${ev.key}:${key}`;
                return (
                  <div key={key} className="flex items-center justify-between md:justify-center gap-2">
                    <span className="md:hidden text-xs text-muted-foreground flex items-center gap-1">
                      <Icon className="w-3 h-3" /> {label}
                    </span>
                    <Switch
                      checked={enabledFor(ev.key, key)}
                      disabled={saving === rowKey}
                      onCheckedChange={(v) => toggle(ev.key, key, v)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 text-xs text-muted-foreground">
        Note: In-app is on by default for every event. Email is opt-in. Telegram delivery requires linking your Telegram
        account under Messaging first.
      </Card>
    </div>
  );
}
