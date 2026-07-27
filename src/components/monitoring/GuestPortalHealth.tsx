/**
 * Guest Portal Health — Operations Monitor panel.
 *
 * Answers the question Nikki actually asks: "some guests pay easily, others
 * get stuck — who is stuck, and where?"
 *
 * Reads `public.guest_portal_activity` (staff-only SELECT via RLS) and turns
 * raw events into a funnel + a recent-activity feed. Read-only: this panel
 * never writes, never mutates a booking.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  CreditCard,
  Upload,
  AlertTriangle,
  Smartphone,
  RefreshCw,
  LogIn,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  created_at: string;
  guest_id: string | null;
  booking_id: string | null;
  event_type: string;
  event_status: string;
  severity: string;
  component: string | null;
  message: string | null;
  error_code: string | null;
  error_message: string | null;
  device_type: string | null;
  browser_name: string | null;
  os_name: string | null;
  is_in_app_browser: boolean;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
};

const WINDOWS = [
  { key: "24", label: "24h", hours: 24 },
  { key: "72", label: "3d", hours: 72 },
  { key: "168", label: "7d", hours: 168 },
] as const;

const FAILURE_TYPES = new Set([
  "checkout_create_failed",
  "checkout_timeout",
  "guest_portal_load_failed",
  "id_upload_failed",
  "guest_client_error",
  "guest_react_error_boundary",
  "guest_network_error",
  "guest_login_failed",
]);

const PLAIN_ENGLISH: Record<string, string> = {
  guest_portal_loaded: "Opened the portal",
  guest_portal_load_failed: "Portal failed to load their bookings",
  guest_booking_loaded: "Saw their booking",
  guest_booking_missing: "Logged in but has no booking linked",
  deposit_button_clicked: "Tapped Pay Deposit",
  deposit_section_scrolled: "Reached the deposit section",
  checkout_button_clicked: "Tapped Pay Deposit Online",
  checkout_create_started: "Checkout being created",
  checkout_create_success: "Checkout created",
  checkout_redirect_started: "Sent to Stripe",
  checkout_create_failed: "Checkout failed",
  checkout_timeout: "Checkout timed out",
  id_upload_button_clicked: "Tapped Upload ID",
  id_upload_section_scrolled: "Reached the ID upload box",
  id_upload_started: "Started uploading ID",
  id_upload_success: "Uploaded ID",
  id_upload_failed: "ID upload failed",
  id_upload_validation_failed: "ID file rejected (type or size)",
  guest_in_app_browser_detected: "Opened inside an in-app browser",
  guest_network_error: "Network error in the portal",
  guest_client_error: "App error in the portal",
  guest_react_error_boundary: "Portal crashed on their screen",
  guest_login_failed: "Login failed",
};

function statusTone(r: Row) {
  if (FAILURE_TYPES.has(r.event_type) || r.severity === "error") return "text-rose-600 dark:text-rose-400";
  if (r.severity === "warning") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function GuestPortalHealth() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("24");
  const hours = WINDOWS.find((w) => w.key === win)!.hours;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["guest-portal-activity", win],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("guest_portal_activity")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 60_000,
  });

  const rows = data ?? [];

  const stats = useMemo(() => {
    const count = (t: string) => rows.filter((r) => r.event_type === t).length;
    const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean)).size;
    const guests = new Set(rows.map((r) => r.guest_id).filter(Boolean)).size;

    const clicked = count("checkout_button_clicked");
    const reached = count("checkout_redirect_started");
    const failed = count("checkout_create_failed") + count("checkout_timeout");
    // "Abandoned" = started checkout, never reached Stripe, and no failure logged.
    const abandoned = Math.max(0, clicked - reached - failed);

    return {
      sessions,
      guests,
      viewedBooking: count("guest_booking_loaded"),
      noBooking: count("guest_booking_missing"),
      depositTapped: count("deposit_button_clicked"),
      clicked,
      reached,
      failed,
      abandoned,
      uploadTapped: count("id_upload_button_clicked"),
      uploadOk: count("id_upload_success"),
      uploadFail: count("id_upload_failed") + count("id_upload_validation_failed"),
      inApp: rows.filter((r) => r.is_in_app_browser).length,
      errors: rows.filter((r) => FAILURE_TYPES.has(r.event_type)).length,
    };
  }, [rows]);

  const stuck = useMemo(
    () => rows.filter((r) => FAILURE_TYPES.has(r.event_type) || r.event_type === "guest_booking_missing").slice(0, 12),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Guest Portal Health
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Who logged in, who paid, who got stuck — last {WINDOWS.find((w) => w.key === win)!.label}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tabs value={win} onValueChange={(v) => setWin(v as typeof win)}>
            <TabsList className="h-8">
              {WINDOWS.map((w) => (
                <TabsTrigger key={w.key} value={w.key} className="text-xs px-2">
                  {w.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading portal activity…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No guest portal activity recorded in this window.
          </p>
        ) : (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={LogIn} label="Guests in portal" value={stats.guests} sub={`${stats.sessions} sessions`} />
              <Stat icon={CreditCard} label="Reached Stripe" value={stats.reached} sub={`${stats.clicked} tapped pay`} />
              <Stat icon={Upload} label="ID uploaded" value={stats.uploadOk} sub={`${stats.uploadTapped} tapped upload`} />
              <Stat
                icon={AlertTriangle}
                label="Problems"
                value={stats.errors}
                sub={stats.abandoned ? `${stats.abandoned} abandoned` : "no drop-offs"}
                tone={stats.errors > 0 ? "bad" : "ok"}
              />
            </div>

            {/* Deposit funnel */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Deposit funnel
              </h4>
              <div className="flex flex-wrap gap-2 text-xs">
                <FunnelPill label="Saw booking" value={stats.viewedBooking} />
                <FunnelPill label="Tapped Pay Deposit" value={stats.depositTapped} />
                <FunnelPill label="Started checkout" value={stats.clicked} />
                <FunnelPill label="Reached Stripe" value={stats.reached} tone="ok" />
                <FunnelPill label="Failed" value={stats.failed} tone={stats.failed ? "bad" : undefined} />
                <FunnelPill label="Abandoned" value={stats.abandoned} tone={stats.abandoned ? "warn" : undefined} />
              </div>
              {stats.inApp > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  {stats.inApp} portal opens happened inside an in-app browser (Instagram/Facebook/etc.) — a common
                  cause of stalled payments. Ask those guests to open the link in Safari or Chrome.
                </p>
              )}
              {stats.noBooking > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  {stats.noBooking} guests signed in with no booking linked to their account — likely booked with a
                  different email.
                </p>
              )}
            </div>

            {/* Guests who got stuck */}
            {stuck.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Guests who got stuck
                </h4>
                <div className="space-y-2">
                  {stuck.map((r) => (
                    <div key={r.id} className="rounded-md border p-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`font-medium ${statusTone(r)}`}>
                          {PLAIN_ENGLISH[r.event_type] ?? r.event_type}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {(r.error_message || r.message) && (
                        <p className="text-muted-foreground mt-1 break-words">{r.error_message ?? r.message}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {r.booking_id && (
                          <Badge variant="outline" className="text-[10px]">
                            booking {r.booking_id.slice(0, 8)}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {r.device_type ?? "?"} · {r.browser_name ?? "?"} · {r.os_name ?? "?"}
                        </Badge>
                        {r.is_in_app_browser && (
                          <Badge variant="outline" className="text-[10px] text-amber-600">
                            in-app browser
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activity */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Recent guest activity
              </h4>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {rows.slice(0, 60).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-xs py-1 border-b last:border-0">
                    <span className={`truncate ${statusTone(r)}`}>
                      {PLAIN_ENGLISH[r.event_type] ?? r.event_type}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  sub?: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`text-xl font-semibold mt-1 ${
          tone === "bad" && value > 0 ? "text-rose-600 dark:text-rose-400" : ""
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function FunnelPill({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "border-amber-500/30 text-amber-700 dark:text-amber-400"
        : tone === "bad"
          ? "border-rose-500/30 text-rose-700 dark:text-rose-400"
          : "";
  return (
    <span className={`rounded-full border px-2.5 py-1 ${cls}`}>
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}
