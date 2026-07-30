// src/components/settings/NotificationSettings.tsx
// -----------------------------------------------------------------------------
// Admin Alert Command Center — Settings → Notifications.
//
// One operational event is created; this screen decides where it lands for THIS
// admin: in-app bell, admin email, or nothing. Routing metadata (category,
// severity, defaults) comes from src/lib/adminAlertCatalog.ts.
//
// Backing table: `messaging_notification_prefs`
//   (user_id, channel, notification_type) with control keys
//   __email_master__ and __critical_only__.
//
// Guest transactional email is NOT controlled here and never can be.
// -----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Bell, Mail, Send, ShieldAlert, Users, Loader2 } from "lucide-react";
import {
  ADMIN_ALERT_EVENTS,
  ALERT_CATEGORIES,
  PREF_CRITICAL_ONLY,
  PREF_EMAIL_MASTER,
  SEVERITY_LABELS,
  passesCriticalOnly,
  type AlertSeverity,
} from "@/lib/adminAlertCatalog";

type Channel = "in_app" | "email";

interface PrefRow {
  user_id: string;
  channel: string;
  notification_type: string;
  enabled: boolean;
}

interface Recipient {
  user_id: string;
  email: string;
  name: string;
  roles: string[];
}

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  info: "bg-muted text-muted-foreground",
  action: "bg-primary/10 text-primary",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  critical: "bg-destructive/10 text-destructive",
};

export default function NotificationSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [lastTest, setLastTest] = useState<{ at: string; sent: number; failed: number; results: any[] } | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const [prefRes, logRes] = await Promise.all([
        supabase
          .from("messaging_notification_prefs")
          .select("user_id, channel, notification_type, enabled")
          .eq("user_id", user.id),
        supabase
          .from("admin_alert_log")
          .select("id, event_type, severity, status, recipient_email, created_at, failure_reason, is_test")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (prefRes.error) {
        console.error(prefRes.error);
        toast.error("Failed to load notification preferences.");
      } else {
        setPrefs((prefRes.data ?? []) as PrefRow[]);
      }
      setRecentAlerts(logRes.data ?? []);
      setLoading(false);
    })();
  }, [user?.id]);

  const rawPref = (type: string, channel: Channel): boolean | undefined =>
    prefs.find((p) => p.notification_type === type && p.channel === channel)?.enabled;

  const emailMaster = rawPref(PREF_EMAIL_MASTER, "email") ?? true;
  const criticalOnly = rawPref(PREF_CRITICAL_ONLY, "email") ?? false;

  const enabledFor = useMemo(
    () => (eventKey: string, channel: Channel) => {
      const stored = rawPref(eventKey, channel);
      const ev = ADMIN_ALERT_EVENTS.find((e) => e.key === eventKey);
      if (stored !== undefined) return stored;
      return channel === "email" ? !!ev?.defaultEmail : !!ev?.defaultInApp;
    },
    [prefs],
  );

  async function savePref(type: string, channel: Channel, next: boolean) {
    if (!user?.id) return;
    const rowKey = `${type}:${channel}`;
    setSaving(rowKey);
    const { error } = await supabase
      .from("messaging_notification_prefs")
      .upsert(
        { user_id: user.id, channel, notification_type: type, enabled: next },
        { onConflict: "user_id,channel,notification_type" },
      );
    if (error) {
      console.error(error);
      toast.error("Couldn't save that preference.");
    } else {
      setPrefs((prev) => [
        ...prev.filter((p) => !(p.notification_type === type && p.channel === channel)),
        { user_id: user.id, channel, notification_type: type, enabled: next },
      ]);
    }
    setSaving(null);
  }

  async function loadRecipients() {
    setLoadingRecipients(true);
    const { data, error } = await supabase.functions.invoke("admin-alert-test", {
      body: { action: "preview" },
    });
    if (error) {
      console.error(error);
      toast.error("Couldn't load the recipient list.");
    } else {
      setRecipients(data?.recipients ?? []);
    }
    setLoadingRecipients(false);
  }

  async function sendTest() {
    setSendingTest(true);
    const { data, error } = await supabase.functions.invoke("admin-alert-test", {
      body: { action: "send" },
    });
    if (error) {
      console.error(error);
      toast.error("Test email failed to dispatch.");
    } else {
      setLastTest({
        at: new Date().toLocaleString(),
        sent: data?.sent ?? 0,
        failed: data?.failed ?? 0,
        results: data?.results ?? [],
      });
      toast.success(`Test sent to ${data?.sent ?? 0} admin${data?.sent === 1 ? "" : "s"}.`);
    }
    setSendingTest(false);
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
      {/* ---------------------------------------------------------- explainer */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Admin alerts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Email alerts are the reliable admin record. Phone push alerts are a separate lane and can be
          reconnected later. Pick what reaches you — you won't get woken up every time someone opens a door.
        </p>
      </Card>

      {/* ------------------------------------------------------ master + mode */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email alerts to me
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Master switch. Off means no admin alert emails at all — the in-app bell still works.
            </p>
          </div>
          <Switch
            checked={emailMaster}
            disabled={saving === `${PREF_EMAIL_MASTER}:email`}
            onCheckedChange={(v) => savePref(PREF_EMAIL_MASTER, "email", v)}
          />
        </div>
        <Separator />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Critical-only mode
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only money problems, failed guest email, failed payments, system critical, reconciliation
              mismatches, guests stuck at payment, cancellations, and availability risk.
            </p>
          </div>
          <Switch
            checked={criticalOnly}
            disabled={!emailMaster || saving === `${PREF_CRITICAL_ONLY}:email`}
            onCheckedChange={(v) => savePref(PREF_CRITICAL_ONLY, "email", v)}
          />
        </div>
      </Card>

      {/* ------------------------------------------------------- test section */}
      <Card className="p-5 space-y-3">
        <div className="font-medium text-sm">Test the admin email lane</div>
        <p className="text-xs text-muted-foreground">
          Sends a harmless test alert to every admin and manager with an email on file. No bookings,
          payments, or guest emails are touched.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadRecipients} disabled={loadingRecipients}>
            {loadingRecipients ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
            Who will get this?
          </Button>
          <Button size="sm" onClick={sendTest} disabled={sendingTest}>
            {sendingTest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Test Email to All Admins
          </Button>
        </div>

        {recipients && (
          <div className="rounded-md border p-3 text-xs space-y-1">
            {recipients.length === 0 && <div className="text-muted-foreground">No admin has an email on file.</div>}
            {recipients.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between gap-2">
                <span>{r.name} — {r.email}</span>
                <span className="text-muted-foreground">{r.roles.join(", ")}</span>
              </div>
            ))}
          </div>
        )}

        {lastTest && (
          <div className="rounded-md border p-3 text-xs space-y-1">
            <div className="font-medium">
              Last test: {lastTest.at} — {lastTest.sent} sent, {lastTest.failed} failed
            </div>
            {lastTest.results.map((r: any, i: number) => (
              <div key={i} className={r.ok ? "text-muted-foreground" : "text-destructive"}>
                {r.ok ? "✓" : "✗"} {r.email}{r.error ? ` — ${r.error}` : ""}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------ event matrix */}
      {ALERT_CATEGORIES.map((cat) => {
        const events = ADMIN_ALERT_EVENTS.filter((e) => e.category === cat.key);
        if (events.length === 0) return null;
        return (
          <Card key={cat.key} className="p-0 overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/40">
              <div className="font-semibold text-sm">{cat.label}</div>
              <div className="text-xs text-muted-foreground">{cat.blurb}</div>
            </div>

            <div className="hidden md:grid grid-cols-[minmax(260px,1fr)_100px_100px] gap-2 px-5 py-2 border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <div>Event</div>
              <div className="text-center">In-app</div>
              <div className="text-center">Email</div>
            </div>

            <div className="divide-y">
              {events.map((ev) => {
                const mutedByMode = criticalOnly && !passesCriticalOnly(ev);
                return (
                  <div
                    key={ev.key}
                    className="grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_100px_100px] gap-3 md:gap-2 px-5 py-4 items-center"
                  >
                    <div>
                      <div className="font-medium text-sm flex flex-wrap items-center gap-2">
                        {ev.label}
                        <Badge variant="outline" className={`text-[10px] border-0 ${SEVERITY_STYLE[ev.severity]}`}>
                          {SEVERITY_LABELS[ev.severity]}
                        </Badge>
                        {!ev.wired && (
                          <Badge variant="outline" className="text-[10px]">Not live yet</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5">Next step: {ev.nextAction}</div>
                    </div>

                    {(["in_app", "email"] as Channel[]).map((ch) => (
                      <div key={ch} className="flex items-center justify-between md:justify-center gap-2">
                        <span className="md:hidden text-xs text-muted-foreground flex items-center gap-1">
                          {ch === "in_app" ? <Bell className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                          {ch === "in_app" ? "In-app" : "Email"}
                        </span>
                        <Switch
                          checked={enabledFor(ev.key, ch)}
                          disabled={
                            saving === `${ev.key}:${ch}` ||
                            (ch === "email" && (!emailMaster || mutedByMode))
                          }
                          onCheckedChange={(v) => savePref(ev.key, ch, v)}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* ------------------------------------------------------ recent record */}
      <Card className="p-5 space-y-2">
        <div className="font-medium text-sm">Recent admin alert emails</div>
        {recentAlerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <div className="text-xs space-y-1">
            {recentAlerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <span className={a.status === "failed" ? "text-destructive" : ""}>
                  {a.event_type}{a.is_test ? " (test)" : ""} → {a.recipient_email}
                </span>
                <span className="text-muted-foreground">
                  {a.status} · {new Date(a.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 text-xs text-muted-foreground">
        Guest emails (booking confirmations, payment links, reminders) are transactional and are never
        controlled by these settings — guests always get them. Repeated non-critical alerts are grouped so
        the same alert can't hit your inbox more than three times in five minutes; critical alerts always
        get through.
      </Card>
    </div>
  );
}
