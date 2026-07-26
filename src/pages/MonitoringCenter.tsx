import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Mail,
  CreditCard,
  Webhook,
  Bell,
  RefreshCw,
  ChevronDown,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ---------- types ----------
type Health = "healthy" | "warning" | "attention";
type Category = "payment" | "email" | "refund" | "booking" | "webhook" | "notification" | "other";

interface Alert {
  id: string;
  health: Health;
  category: Category;
  title: string;          // plain English
  detail?: string;        // optional plain-English context
  bookingId?: string | null;
  when: string;           // ISO
  suggestedAction: string;
  technical?: Record<string, unknown>;
  retryable?: boolean;
}

interface ActivityItem {
  id: string;
  when: string;
  icon: typeof Mail;
  label: string;
  status: "ok" | "warn" | "fail";
}

// ---------- helpers ----------
const sinceHours = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// Any historical incident older than this with no fresh recurrence is treated
// as auto-resolved so it stops nagging admins after the underlying fix lands.
const AUTO_RESOLVE_HOURS = 24;
const AUTO_RESOLVE_CATEGORIES: ReadonlyArray<Category> = ["email", "webhook", "notification"];
const isStale = (whenIso: string) =>
  Date.now() - new Date(whenIso).getTime() > AUTO_RESOLVE_HOURS * 3600_000;

const healthStyles: Record<Health, { dot: string; label: string; pill: string }> = {
  healthy: {
    dot: "bg-emerald-500",
    label: "Healthy",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  warning: {
    dot: "bg-amber-500",
    label: "Warning",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  attention: {
    dot: "bg-rose-500",
    label: "Attention Required",
    pill: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  },
};

const categoryIcon: Record<Category, typeof Mail> = {
  payment: CreditCard,
  email: Mail,
  refund: RefreshCw,
  booking: Activity,
  webhook: Webhook,
  notification: Bell,
  other: AlertTriangle,
};

// ---------- data fetcher ----------
async function fetchMonitoring(rangeHours: number) {
  const since = sinceHours(rangeHours);

  const [emails, payEvents, recon, webhooks, notifs, securityEvts] = await Promise.all([
    supabase
      .from("email_log")
      .select("id, template_key, recipient_email, status, sent_at, booking_id, failure_category, failure_reason, error_message, retry_count, correlation_id, last_retry_at")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(200),
    supabase
      .from("payment_events")
      .select("id, provider, event_type, processed, retry_count, last_error, last_retry_at, created_at, payment_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payment_reconciliation_log")
      .select("id, severity, kind, payment_id, stripe_object_id, expected, actual, details, run_at")
      .gte("run_at", since)
      .order("run_at", { ascending: false })
      .limit(200),
    supabase
      .from("webhook_health")
      .select("provider, status, last_received_at, last_success_at, last_failure_at, last_failure_reason, updated_at"),
    supabase
      .from("messaging_notification_log")
      .select("id, channel, notification_type, outcome, error, created_at, user_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("security_events")
      .select("id, event_type, severity, details, created_at")
      .gte("created_at", since)
      .in("severity", ["high", "critical"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    emails: emails.data ?? [],
    payEvents: payEvents.data ?? [],
    recon: recon.data ?? [],
    webhooks: webhooks.data ?? [],
    notifs: notifs.data ?? [],
    securityEvts: securityEvts.data ?? [],
  };
}

// ---------- alert builder ----------
function buildAlerts(d: Awaited<ReturnType<typeof fetchMonitoring>>): Alert[] {
  const out: Alert[] = [];

  // Email failures — grouped by (template, recipient, failure category, reason)
  // so the monitor doesn't spam identical failures. Task 4.
  const categoryToMessage: Record<string, { title: string; action: string; severity: Health }> = {
    auth: { title: "Email provider rejected our API key.", action: "Update the Resend API key in Settings → Integrations, then resend from the booking.", severity: "attention" },
    sender_domain: { title: "Provider rejected the sender domain.", action: "Verify lmtcampstay.com in Resend (SPF + DKIM), then resend.", severity: "attention" },
    invalid_recipient: { title: "Guest email address was rejected as invalid.", action: "Correct the guest's email on the booking and resend.", severity: "warning" },
    rate_limited: { title: "Email provider is rate-limiting us.", action: "Wait a few minutes — the pipeline auto-retries with backoff.", severity: "warning" },
    provider_outage: { title: "Temporary email provider outage.", action: "Auto-retried up to 3× — will heal on its own if provider recovers.", severity: "warning" },
    timeout: { title: "Email provider timed out.", action: "Auto-retried — resend manually if it keeps failing.", severity: "warning" },
    network: { title: "Network error reaching the email provider.", action: "Usually transient — check again in a few minutes.", severity: "warning" },
    validation: { title: "Email payload was rejected by the provider.", action: "Check template configuration.", severity: "attention" },
    configuration: { title: "Email provider is not configured.", action: "Add the Resend API key in Settings → Integrations.", severity: "attention" },
    unknown: { title: "Guest email failed to send.", action: "Open the booking and resend. Check the correlation ID in logs if it repeats.", severity: "warning" },
  };
  const groups = new Map<string, { latest: any; count: number }>();
  for (const e of d.emails) {
    if (!["dlq", "failed", "bounced", "no_provider"].includes(e.status)) continue;
    const cat = (e.failure_category || "unknown") as string;
    const key = `${e.template_key}|${e.recipient_email}|${cat}|${e.failure_reason || e.error_message || ""}`;
    const existing = groups.get(key);
    if (!existing || new Date(e.sent_at) > new Date(existing.latest.sent_at)) {
      groups.set(key, { latest: e, count: (existing?.count ?? 0) + 1 });
    } else {
      existing.count += 1;
    }
  }
  for (const { latest: e, count } of groups.values()) {
    const cat = (e.failure_category || "unknown") as string;
    const meta = categoryToMessage[cat] || categoryToMessage.unknown;
    const suffix = count > 1 ? ` (${count} identical failures)` : "";
    out.push({
      id: `email-${e.id}`,
      health: meta.severity,
      category: "email",
      title: `${meta.title}${suffix}`,
      detail: [
        `Template: ${e.template_key}`,
        `Recipient: ${e.recipient_email}`,
        e.failure_reason ? `Reason: ${e.failure_reason}` : null,
        e.retry_count ? `Retries: ${e.retry_count}` : null,
        e.correlation_id ? `Correlation: ${e.correlation_id.slice(0, 8)}` : null,
      ].filter(Boolean).join(" · "),
      bookingId: e.booking_id,
      when: e.sent_at,
      suggestedAction: meta.action,
      technical: {
        status: e.status,
        template: e.template_key,
        failure_category: cat,
        error_message: e.error_message,
        retry_count: e.retry_count,
        correlation_id: e.correlation_id,
        last_retry_at: e.last_retry_at,
        grouped_count: count,
      },
      retryable: false,
    });
  }
  // Suppressed emails (unchanged behavior)
  for (const e of d.emails) {
    if (e.status === "suppressed") {
      out.push({
        id: `email-${e.id}`,
        health: "warning",
        category: "email",
        title: `Email was blocked before sending (${e.template_key}).`,
        detail: `Recipient: ${e.recipient_email}`,
        bookingId: e.booking_id,
        when: e.sent_at,
        suggestedAction: "Confirm the address isn't on the suppression list.",
        technical: { status: e.status },
      });
    }
  }

  // Payment / webhook event failures
  for (const p of d.payEvents) {
    if (!p.processed && (p.retry_count > 0 || p.last_error)) {
      out.push({
        id: `payev-${p.id}`,
        health: p.retry_count >= 3 ? "attention" : "warning",
        category: "webhook",
        title: `Stripe sent us an update we couldn't process (${p.event_type}).`,
        detail: p.last_error ? `Reason: ${p.last_error}` : undefined,
        when: p.created_at,
        suggestedAction: "Retry webhook processing. If it keeps failing, contact technical support.",
        technical: { provider: p.provider, retries: p.retry_count, last_error: p.last_error },
        retryable: true,
      });
    }
  }

  // Reconciliation issues
  for (const r of d.recon) {
    if (r.severity === "warning" || r.severity === "error" || r.severity === "critical") {
      const isMismatch = r.kind?.includes("mismatch");
      const isOrphan = r.kind?.includes("orphan");
      out.push({
        id: `recon-${r.id}`,
        health: r.severity === "warning" ? "warning" : "attention",
        category: isOrphan ? "booking" : "payment",
        title: isMismatch
          ? "Stripe and our records show different amounts on a payment."
          : isOrphan
          ? "Stripe confirmed a payment, but no booking is linked."
          : `Payment reconciliation flagged an issue (${r.kind}).`,
        detail: r.expected != null && r.actual != null
          ? `Expected ฿${Number(r.expected).toLocaleString()}, got ฿${Number(r.actual).toLocaleString()}.`
          : undefined,
        when: r.run_at,
        suggestedAction: "Open the booking and confirm payment status. If amounts differ, refund or adjust manually.",
        technical: { kind: r.kind, stripe_id: r.stripe_object_id, details: r.details },
      });
    }
  }

  // Webhook health (per-provider)
  for (const w of d.webhooks) {
    const reason: string = w.last_failure_reason ?? "";
    // Unsigned probes/scanners hitting the endpoint without a stripe-signature
    // header are correctly rejected upstream and must NOT surface as a real
    // Stripe outage in the Operations Monitor.
    const isUnsignedProbe = /missing stripe-signature/i.test(reason);
    const failedRecently =
      w.last_failure_at &&
      (!w.last_success_at || new Date(w.last_failure_at) > new Date(w.last_success_at));
    const realFailure = failedRecently && !isUnsignedProbe;
    const neverSucceeded = !w.last_success_at;
    const stale =
      w.last_received_at &&
      !neverSucceeded &&
      Date.now() - new Date(w.last_received_at).getTime() > 24 * 3600_000;
    if (w.status === "down" || realFailure) {
      out.push({
        id: `wh-${w.provider}`,
        health: "attention",
        category: "webhook",
        title: `${w.provider} signature verification failed.`,
        detail: reason || "Check webhook secret or Stripe endpoint configuration.",
        when: w.last_failure_at ?? w.updated_at,
        suggestedAction: "Verify the webhook secret matches the Stripe dashboard and that the endpoint URL is correct.",
        technical: { status: w.status },
      });
    } else if (stale) {
      out.push({
        id: `wh-${w.provider}-stale`,
        health: "warning",
        category: "webhook",
        title: `No ${w.provider} webhook events in 24+ hours.`,
        detail: "This is unusual during business hours.",
        when: w.last_received_at!,
        suggestedAction: "Verify the integration is still connected.",
      });
    }
    // neverSucceeded (with or without unsigned-probe noise) intentionally
    // produces no alert — it's just "awaiting first Stripe event".
  }


  // Notification failures
  for (const n of d.notifs) {
    if (n.outcome === "failed" || n.outcome === "error") {
      out.push({
        id: `notif-${n.id}`,
        health: "warning",
        category: "notification",
        title: `Guest portal notification didn't reach the user (${n.channel}).`,
        detail: n.error ?? undefined,
        when: n.created_at,
        suggestedAction: "Ask the guest to re-enable notifications, or follow up directly.",
        technical: { channel: n.channel, type: n.notification_type },
        retryable: true,
      });
    }
  }

  // Security spikes
  for (const s of d.securityEvts) {
    out.push({
      id: `sec-${s.id}`,
      health: s.severity === "critical" ? "attention" : "warning",
      category: "other",
      title: `Security event: ${s.event_type}.`,
      when: s.created_at,
      suggestedAction: "Review in the Security Center.",
      technical: s.details as Record<string, unknown>,
    });
  }

  // newest first
  return out.sort((a, b) => +new Date(b.when) - +new Date(a.when));
}

function buildActivity(d: Awaited<ReturnType<typeof fetchMonitoring>>): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const e of d.emails.slice(0, 20)) {
    items.push({
      id: `e-${e.id}`,
      when: e.sent_at,
      icon: Mail,
      label: `Email sent: ${e.template_key} → ${e.recipient_email}`,
      status: e.status === "sent" ? "ok" : ["dlq", "failed", "bounced"].includes(e.status) ? "fail" : "warn",
    });
  }
  for (const p of d.payEvents.slice(0, 20)) {
    items.push({
      id: `p-${p.id}`,
      when: p.created_at,
      icon: CreditCard,
      label: `Stripe event: ${p.event_type}${p.processed ? "" : " (unprocessed)"}`,
      status: p.processed ? "ok" : "warn",
    });
  }
  for (const n of d.notifs.slice(0, 20)) {
    items.push({
      id: `n-${n.id}`,
      when: n.created_at,
      icon: Bell,
      label: `Notification: ${n.notification_type} via ${n.channel}`,
      status: n.outcome === "delivered" || n.outcome === "ok" ? "ok" : n.outcome === "failed" ? "fail" : "warn",
    });
  }
  return items.sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 30);
}

function overallHealth(alerts: Alert[]): Health {
  if (alerts.some((a) => a.health === "attention")) return "attention";
  if (alerts.some((a) => a.health === "warning")) return "warning";
  return "healthy";
}

// ---------- UI ----------
type FilterKey = "all" | "critical" | Category;

export default function MonitoringCenter() {
  const [rangeHours, setRangeHours] = useState<24 | 168>(24);
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["monitoring", rangeHours],
    queryFn: () => fetchMonitoring(rangeHours),
    refetchInterval: 60_000,
  });

  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const activity = useMemo(() => (data ? buildActivity(data) : []), [data]);
  const overall = overallHealth(alerts);

  // Split stale historical incidents into an "auto-resolved" bucket so a fix
  // that landed hours ago stops lighting up the monitor red.
  const { activeAlerts, resolvedAlerts } = useMemo(() => {
    const active: Alert[] = [];
    const resolved: Alert[] = [];
    for (const a of alerts) {
      if (AUTO_RESOLVE_CATEGORIES.includes(a.category) && isStale(a.when)) {
        resolved.push(a);
      } else {
        active.push(a);
      }
    }
    return { activeAlerts: active, resolvedAlerts: resolved };
  }, [alerts]);

  const activeOverall = overallHealth(activeAlerts);

  const filtered = useMemo(() => {
    if (filter === "all") return activeAlerts;
    if (filter === "critical") return activeAlerts.filter((a) => a.health === "attention");
    return activeAlerts.filter((a) => a.category === filter);
  }, [activeAlerts, filter]);

  const counts = {
    attention: activeAlerts.filter((a) => a.health === "attention").length,
    warning: activeAlerts.filter((a) => a.health === "warning").length,
    healthy: activeAlerts.length === 0,
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Operations Monitor</h1>
            <p className="text-sm text-muted-foreground">
              A plain-English health check of payments, emails, bookings, and notifications.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v) as 24 | 168)}>
              <TabsList>
                <TabsTrigger value="24">Today</TabsTrigger>
                <TabsTrigger value="168">Last 7 days</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Overall status */}
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <span className={`h-3 w-3 rounded-full ${healthStyles[overall].dot}`} />
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">Overall system status</div>
              <div className="text-xl font-semibold">
                {overall === "healthy"
                  ? "Everything looks good."
                  : overall === "warning"
                  ? "A few things need attention soon."
                  : "Something needs action right now."}
              </div>
            </div>
            <div className="hidden md:flex gap-4 text-sm">
              <Stat label="Needs action" value={counts.attention} tone="attention" />
              <Stat label="Warnings" value={counts.warning} tone="warning" />
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["critical", "Critical only"],
            ["payment", "Payment issues"],
            ["email", "Email issues"],
            ["refund", "Refund issues"],
            ["booking", "Booking issues"],
            ["webhook", "Webhook issues"],
            ["notification", "Notification issues"],
          ] as [FilterKey, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Checking systems…</div>
            ) : filtered.length === 0 ? (
              <EmptyHealthy />
            ) : (
              filtered.map((a) => <AlertRow key={a.id} alert={a} />)
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <div className="text-sm text-muted-foreground">No recent activity in this window.</div>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((it) => {
                  const Icon = it.icon;
                  const tone =
                    it.status === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : it.status === "warn"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400";
                  return (
                    <li key={it.id} className="flex items-center gap-3 py-2 text-sm">
                      <Icon className={`h-4 w-4 ${tone}`} />
                      <span className="flex-1 truncate">{it.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(it.when), { addSuffix: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: Health }) {
  return (
    <div className="flex flex-col items-end">
      <span className={`text-lg font-semibold ${tone === "attention" ? "text-rose-600" : "text-amber-600"}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyHealthy() {
  return (
    <div className="flex items-center gap-3 py-6 text-sm">
      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      <span>No alerts in this window. The system is running normally.</span>
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const Icon = categoryIcon[alert.category];
  const HealthIcon = alert.health === "attention" ? AlertOctagon : alert.health === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={healthStyles[alert.health].pill}>
              <HealthIcon className="h-3 w-3 mr-1" />
              {healthStyles[alert.health].label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(alert.when), { addSuffix: true })}
            </span>
            {alert.bookingId && (
              <Link
                to={`/bookings?id=${alert.bookingId}`}
                className="text-xs text-primary hover:underline"
              >
                Open booking
              </Link>
            )}
          </div>
          <div className="text-sm font-medium">{alert.title}</div>
          {alert.detail && <div className="text-sm text-muted-foreground">{alert.detail}</div>}
          <div className="text-sm">
            <span className="text-muted-foreground">Suggested: </span>
            {alert.suggestedAction}
          </div>
          {alert.technical && (
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1">
                <ChevronDown className="h-3 w-3" />
                Technical details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-auto max-h-48">
                  {JSON.stringify(alert.technical, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}
