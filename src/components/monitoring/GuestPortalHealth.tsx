/**
 * Guest Portal Health — Operations Monitor panel (top of page).
 *
 * Answers the question Nikki actually asks: "some guests pay easily, others
 * get stuck — who is stuck, and where?"
 *
 * Reads `public.guest_portal_activity` (staff-only SELECT via RLS) and turns
 * raw events into a plain-English readout. Read-only: this panel never writes,
 * never mutates a booking.
 *
 * WRITING RULE FOR THIS FILE: no tech jargon in anything a human reads.
 * Every label is a sentence a front-desk person understands cold. Every time
 * is spelled out as "how long ago" plus the actual clock time. Every booking
 * is named by guest + confirmation number, never a raw UUID fragment.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import {
  Users,
  CreditCard,
  Upload,
  AlertTriangle,
  Smartphone,
  RefreshCw,
  LogIn,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatInPropertyTimezone } from "@/lib/timezone";

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

type BookingLabel = {
  id: string;
  confirmation_number: string | null;
  manual_guest_name: string | null;
  check_in: string;
  state: string;
  profiles: { full_name: string | null } | null;
};

const WINDOWS = [
  { key: "24", label: "Today", hours: 24, phrase: "the last 24 hours" },
  { key: "72", label: "3 days", hours: 72, phrase: "the last 3 days" },
  { key: "168", label: "7 days", hours: 168, phrase: "the last 7 days" },
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

/**
 * Plain-English event names. Left side is the raw event we log, right side is
 * what a person reads. If an event ever shows up here as raw text, it means we
 * forgot to add it to this map.
 */
const PLAIN_ENGLISH: Record<string, string> = {
  guest_portal_loaded: "Opened their guest page",
  guest_portal_load_failed: "Their guest page wouldn't load their booking",
  guest_booking_loaded: "Saw their booking on screen",
  guest_booking_missing: "Signed in, but no booking is attached to their email",
  deposit_button_clicked: "Tapped the Pay Deposit button",
  deposit_section_scrolled: "Scrolled down to the deposit section",
  checkout_button_clicked: "Tapped Pay Deposit Online",
  checkout_create_started: "We started building their payment page",
  checkout_create_success: "Payment page was built and ready",
  checkout_redirect_started: "Got handed off to the card payment page",
  checkout_create_failed: "We couldn't build their payment page",
  checkout_timeout: "Payment page took too long and gave up",
  id_upload_button_clicked: "Tapped Upload ID",
  id_upload_section_scrolled: "Scrolled down to the ID upload box",
  id_upload_started: "Started sending us their ID",
  id_upload_success: "Sent us their ID successfully",
  id_upload_failed: "Their ID upload didn't go through",
  id_upload_validation_failed: "We rejected their ID file — wrong file type or too big",
  guest_in_app_browser_detected: "Opened the link inside a social app instead of a real browser",
  guest_network_error: "Lost internet while on their guest page",
  guest_client_error: "Something broke on their guest page",
  guest_react_error_boundary: "Their guest page crashed and showed an error screen",
  guest_login_failed: "Couldn't log in",
};

/** How long we wait after a tap before we call it "nothing happened". */
const STALL_MINUTES = 10;

/** Any of these, logged after the click, means the guest was not left hanging. */
const RESOLVING_TYPES = new Set([
  "checkout_redirect_started",
  "checkout_create_success",
  "checkout_create_failed",
  "checkout_timeout",
  "checkout_redirect_stalled",
]);

function statusTone(r: Row) {
  if (FAILURE_TYPES.has(r.event_type) || r.severity === "error") return "text-rose-600 dark:text-rose-400";
  if (r.severity === "warning") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/**
 * Always show both: how long ago it happened AND the actual clock time.
 * "1 hour ago" on its own is the thing that confuses people — they can't tell
 * whether it means "1 hour ago" or "1 hour left".
 */
function WhenLabel({ iso }: { iso: string }) {
  return (
    <span className="text-muted-foreground shrink-0 whitespace-nowrap">
      {formatDistanceToNow(new Date(iso), { addSuffix: true })} · {formatInPropertyTimezone(iso, "time")}
    </span>
  );
}

/** Turn "instagram in-app browser on iPhone" into words. */
function deviceSentence(r: Row) {
  const bits: string[] = [];
  if (r.device_type) bits.push(r.device_type === "mobile" ? "on their phone" : `on ${r.device_type}`);
  if (r.browser_name) bits.push(`using ${r.browser_name}`);
  if (r.os_name) bits.push(`(${r.os_name})`);
  return bits.length ? bits.join(" ") : "device unknown";
}

export function GuestPortalHealth() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("24");
  const windowDef = WINDOWS.find((w) => w.key === win)!;
  const hours = windowDef.hours;

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

  const rows = useMemo(() => data ?? [], [data]);

  // Resolve raw booking ids into "Arvid Kestens · LMT-2026-0142" labels.
  const bookingIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.booking_id).filter(Boolean))) as string[],
    [rows],
  );

  const { data: bookingLabels } = useQuery({
    queryKey: ["guest-portal-booking-labels", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, confirmation_number, manual_guest_name, check_in, state, profiles:guest_id(full_name)")
        .in("id", bookingIds);
      if (error) throw error;
      const map = new Map<string, BookingLabel>();
      for (const b of (data ?? []) as unknown as BookingLabel[]) map.set(b.id, b);
      return map;
    },
  });

  /** Renders a human booking reference instead of a UUID stub. */
  const BookingRef = ({ id }: { id: string }) => {
    const b = bookingLabels?.get(id);
    const name = b?.profiles?.full_name || b?.manual_guest_name || "Guest";
    const ref = b?.confirmation_number ? ` · ${b.confirmation_number}` : "";
    return (
      <Link
        to={`/bookings?id=${id}`}
        className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
      >
        {b ? `${name}${ref}` : "Open booking"}
        <ArrowRight className="h-3 w-3" />
      </Link>
    );
  };

  /**
   * Names for people who were signed in but whose event isn't tied to a booking
   * (e.g. they logged in and no booking was attached to their email).
   */
  const guestIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.guest_id).filter(Boolean))) as string[],
    [rows],
  );

  const { data: guestNames } = useQuery({
    queryKey: ["guest-portal-guest-names", guestIds.sort().join(",")],
    enabled: guestIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", guestIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of data ?? []) {
        map.set(p.user_id as string, (p.full_name as string) || (p.email as string) || "Guest");
      }
      return map;
    },
  });

  /** "Arvid Kestens · LMT-2026-0142" / "Signed-in guest" / "Someone not signed in". */
  const whoLabel = (r: Row) => {
    const b = r.booking_id ? bookingLabels?.get(r.booking_id) : null;
    const name =
      b?.profiles?.full_name ||
      b?.manual_guest_name ||
      (r.guest_id ? guestNames?.get(r.guest_id) : null);
    if (name) return b?.confirmation_number ? `${name} · ${b.confirmation_number}` : name;
    if (r.guest_id) return "A signed-in guest (name not on file yet)";
    return "Somebody not signed in";
  };

  /** Every other thing logged in the same browser visit, oldest first. */
  const sessionTrail = useMemo(() => {
    if (!selected) return [] as Row[];
    const key = selected.session_id;
    const same = key
      ? rows.filter((r) => r.session_id === key)
      : rows.filter((r) => r.guest_id && r.guest_id === selected.guest_id);
    return [...same].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [rows, selected, guestNames]);



  const stats = useMemo(() => {
    const count = (t: string) => rows.filter((r) => r.event_type === t).length;
    const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean)).size;
    const guests = new Set(rows.map((r) => r.guest_id).filter(Boolean)).size;

    const clicked = count("checkout_button_clicked");
    const reached = count("checkout_redirect_started");
    const failed = count("checkout_create_failed") + count("checkout_timeout");
    // "Walked away" = started paying, never got to the card page, no error either.
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

  /**
   * Alert: guest tapped Pay Deposit and then nothing happened at all.
   * No card page, no error message — the button just ate the tap.
   */
  const stalledCheckouts = useMemo(() => {
    const cutoff = Date.now() - STALL_MINUTES * 60_000;
    const clicks = rows.filter(
      (r) => r.event_type === "checkout_button_clicked" || r.event_type === "deposit_button_clicked",
    );
    const resolvers = rows.filter((r) => RESOLVING_TYPES.has(r.event_type));

    const bySession = new Map<string, Row>();
    for (const c of clicks) {
      const t = new Date(c.created_at).getTime();
      if (t > cutoff) continue; // still inside the grace window
      const key = c.session_id ?? c.guest_id ?? c.id;
      const resolved = resolvers.some(
        (r) => (r.session_id ?? r.guest_id) === (c.session_id ?? c.guest_id) && new Date(r.created_at).getTime() >= t,
      );
      if (resolved) continue;
      const prev = bySession.get(key);
      if (!prev || new Date(prev.created_at).getTime() < t) bySession.set(key, c);
    }
    return Array.from(bySession.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [rows]);

  const stuck = useMemo(
    () => rows.filter((r) => FAILURE_TYPES.has(r.event_type) || r.event_type === "guest_booking_missing").slice(0, 12),
    [rows],
  );

  /** One-line summary of the whole panel, in words, at the very top. */
  const headline = useMemo(() => {
    if (rows.length === 0) return null;
    if (stalledCheckouts.length > 0)
      return {
        tone: "bad" as const,
        text: `${stalledCheckouts.length} guest${stalledCheckouts.length === 1 ? " is" : "s are"} stuck trying to pay right now. Reach out to them.`,
      };
    if (stats.errors > 0)
      return {
        tone: "warn" as const,
        text: `${stats.errors} guest${stats.errors === 1 ? " ran" : "s ran"} into a problem on their guest page. Nothing is blocking payments overall.`,
      };
    return {
      tone: "ok" as const,
      text: "No guest is stuck. Everyone who tried to pay or upload an ID got through.",
    };
  }, [rows.length, stalledCheckouts.length, stats.errors]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            How guests are doing right now
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Everything a guest did on their own booking page over {windowDef.phrase} — who logged in, who paid, and
            who got stuck.
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
          <p className="text-sm text-muted-foreground">Checking what guests have been up to…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No guest opened their booking page in {windowDef.phrase}. That's normal on a quiet day — it does not mean
            anything is broken.
          </p>
        ) : (
          <>
            {/* One-sentence verdict */}
            {headline && (
              <div
                className={`rounded-md border p-3 text-sm font-medium ${
                  headline.tone === "bad"
                    ? "border-rose-500/40 bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400"
                    : headline.tone === "warn"
                      ? "border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
                      : "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {headline.text}
              </div>
            )}

            {/* Headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                icon={LogIn}
                label="Guests who logged in"
                value={stats.guests}
                sub={`${stats.sessions} separate visits`}
              />
              <Stat
                icon={CreditCard}
                label="Made it to the card page"
                value={stats.reached}
                sub={`out of ${stats.clicked} who tapped Pay`}
              />
              <Stat
                icon={Upload}
                label="IDs received"
                value={stats.uploadOk}
                sub={`${stats.uploadTapped} tried to send one`}
              />
              <Stat
                icon={AlertTriangle}
                label="Guests who hit a problem"
                value={stats.errors}
                sub={stats.abandoned ? `${stats.abandoned} walked away mid-payment` : "nobody dropped off"}
                tone={stats.errors > 0 ? "bad" : "ok"}
              />
            </div>

            {/* ALERT — tapped pay, nothing happened */}
            {stalledCheckouts.length > 0 && (
              <div className="rounded-md border border-rose-500/40 bg-rose-50/60 dark:bg-rose-950/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
                      {stalledCheckouts.length} guest{stalledCheckouts.length === 1 ? "" : "s"} tapped Pay Deposit and
                      the button did nothing
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      They never got to the card payment page, and no error was shown to them either — it just sat
                      there for more than {STALL_MINUTES} minutes. These guests think they tried to pay and gave up.
                      Text them a direct payment link.
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {stalledCheckouts.slice(0, 8).map((r) => (
                    <div key={r.id} className="rounded border bg-background/60 p-2 text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {r.booking_id ? <BookingRef id={r.booking_id} /> : <span>Guest not identified</span>}
                        <WhenLabel iso={r.created_at} />
                      </div>
                      <p className="text-muted-foreground">
                        Tapped Pay {deviceSentence(r)}.
                        {r.is_in_app_browser
                          ? " They opened the link inside a social app (Instagram, Facebook, etc.) — that's almost certainly why it froze."
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment step-by-step */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Where guests are in the payment steps
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Read left to right. Each number should be close to the one before it — a big drop means guests are
                falling out at that step.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <FunnelPill label="Saw their booking" value={stats.viewedBooking} />
                <FunnelPill label="Tapped Pay Deposit" value={stats.depositTapped} />
                <FunnelPill label="Started paying" value={stats.clicked} />
                <FunnelPill label="Reached the card page" value={stats.reached} tone="ok" />
                <FunnelPill label="Got an error" value={stats.failed} tone={stats.failed ? "bad" : undefined} />
                <FunnelPill
                  label="Walked away mid-payment"
                  value={stats.abandoned}
                  tone={stats.abandoned ? "warn" : undefined}
                />
              </div>
              {stats.inApp > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {stats.inApp} guest visits came from a link tapped inside a social app (Instagram, Facebook,
                    Messenger). Those mini-browsers block card payments a lot of the time. Tell those guests to open
                    the link in Safari or Chrome instead.
                  </span>
                </p>
              )}
              {stats.noBooking > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  {stats.noBooking} guest{stats.noBooking === 1 ? "" : "s"} signed in and saw an empty page — their
                  booking is under a different email than the one they signed up with. Match the emails on the booking
                  and it'll show up.
                </p>
              )}
              {stats.uploadFail > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  {stats.uploadFail} ID upload{stats.uploadFail === 1 ? "" : "s"} didn't go through — usually a photo
                  that's too large or a file type we don't take. Ask for a regular phone photo (JPG or PNG).
                </p>
              )}
            </div>

            {/* Guests who got stuck */}
            {stuck.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Guests who hit a wall
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  These people had something go wrong on their end. Each one is worth a quick message.
                </p>
                <div className="space-y-2">
                  {stuck.map((r) => (
                    <div key={r.id} className="rounded-md border p-2.5 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`font-medium ${statusTone(r)}`}>
                          {PLAIN_ENGLISH[r.event_type] ?? r.event_type}
                        </span>
                        <WhenLabel iso={r.created_at} />
                      </div>
                      <p className="text-muted-foreground">
                        {deviceSentence(r)}
                        {r.is_in_app_browser ? " — opened from inside a social app" : ""}.
                      </p>
                      {(r.error_message || r.message) && (
                        <p className="text-muted-foreground/80 break-words italic">
                          What the system saw: {r.error_message ?? r.message}
                        </p>
                      )}
                      {r.booking_id && <BookingRef id={r.booking_id} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activity */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Everything guests did, newest first
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Tap any line to see who it was, what device they were on, and everything else
                they did in that same visit.
              </p>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {rows.slice(0, 60).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="w-full flex items-center justify-between gap-3 text-xs py-1.5 border-b last:border-0 text-left hover:bg-accent/40 rounded-sm px-1 -mx-1 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className={`block truncate ${statusTone(r)}`}>
                        {PLAIN_ENGLISH[r.event_type] ?? r.event_type}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {whoLabel(r)}
                      </span>
                    </span>
                    <WhenLabel iso={r.created_at} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Who did what — full detail for one logged action */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {selected ? (PLAIN_ENGLISH[selected.event_type] ?? selected.event_type) : ""}
            </DialogTitle>
            <DialogDescription>
              {selected ? (
                <>
                  {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })} ·{" "}
                  {formatInPropertyTimezone(selected.created_at, "datetime")} Thailand time
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Who
                </p>
                <p>{whoLabel(selected)}</p>
                {selected.booking_id && <BookingRef id={selected.booking_id} />}
                {!selected.guest_id && !selected.booking_id && (
                  <p className="text-xs text-muted-foreground">
                    Nobody was signed in yet — this was an anonymous visit to the guest page.
                  </p>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What they were on
                </p>
                <p>{deviceSentence(selected)}</p>
                {selected.is_in_app_browser && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    They opened the link inside a social app (Instagram, Facebook, LINE) instead of
                    a real browser. That's the usual reason payments hang.
                  </p>
                )}
              </div>

              {(selected.error_message || selected.message || selected.error_code) && (
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    What the system saw
                  </p>
                  <p className="break-words italic text-muted-foreground">
                    {selected.error_message ?? selected.message}
                    {selected.error_code ? ` (${selected.error_code})` : ""}
                  </p>
                </div>
              )}

              <div className="rounded-md border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Everything else in this same visit
                </p>
                {sessionTrail.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This is the only thing we logged for this visit.
                  </p>
                ) : (
                  <ol className="space-y-1">
                    {sessionTrail.map((r) => (
                      <li
                        key={r.id}
                        className={`flex items-start justify-between gap-3 text-xs ${
                          r.id === selected.id ? "font-semibold" : ""
                        }`}
                      >
                        <span className={statusTone(r)}>
                          {PLAIN_ENGLISH[r.event_type] ?? r.event_type}
                        </span>
                        <WhenLabel iso={r.created_at} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Visit reference: {selected.session_id ?? "not recorded"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`text-xl font-semibold mt-1 ${
          tone === "bad" && value > 0 ? "text-rose-600 dark:text-rose-400" : ""
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
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
