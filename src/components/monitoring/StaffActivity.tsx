/**
 * Staff Activity — Operations Monitor panel.
 *
 * The other side of the coin from Guest Portal Health. That panel tracks what
 * *guests* did. This one tracks what *your people* did: who moved a booking,
 * who changed somebody's role, who overrode a rule, who deleted something.
 *
 * Two sources, merged into one timeline:
 *   1. `public.booking_state_log`  — every booking state change + who made it
 *   2. `public.staff_audit_events` — role changes, overrides, deletions, MFA,
 *                                    backdated bookings, guest merges
 *
 * WRITING RULE FOR THIS FILE (same as GuestPortalHealth): no tech jargon in
 * anything a human reads. Names, not UUIDs. "How long ago" plus the real clock
 * time, always both, so nobody confuses "1 hour ago" with "1 hour left".
 *
 * Read-only. This panel never writes and never mutates a booking.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { ShieldCheck, RefreshCw, ArrowRight, UserCog, CalendarClock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatInPropertyTimezone } from "@/lib/timezone";
import { useAuth } from "@/hooks/useAuth";

const WINDOWS = [
  { key: "24", label: "Today", hours: 24, phrase: "the last 24 hours" },
  { key: "168", label: "7 days", hours: 168, phrase: "the last 7 days" },
  { key: "720", label: "30 days", hours: 720, phrase: "the last 30 days" },
] as const;

/** Booking states in words a front-desk person reads without translating. */
const STATE_WORDS: Record<string, string> = {
  inquiry: "an inquiry",
  soft_hold: "on hold",
  pending_approval: "waiting for approval",
  pending_deposit: "waiting on the deposit",
  confirmed: "confirmed",
  checked_in: "checked in",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "a no-show",
};

/** Audit event types in plain English. Anything missing falls back to raw text. */
const AUDIT_WORDS: Record<string, string> = {
  role_changed: "Changed someone's job role",
  permission_changed: "Changed someone's permissions",
  staff_invited: "Invited a new staff member",
  staff_deactivated: "Turned off a staff account",
  staff_session_revoked: "Forced someone to sign out",
  security_setting_changed: "Changed a security setting",
  mfa_policy_changed: "Changed the two-step login rule",
  mfa_enabled: "Turned on two-step login",
  mfa_disabled: "Turned off two-step login",
  mfa_setup_completed: "Finished setting up two-step login",
  mfa_challenge_failed: "Failed a two-step login check",
  step_up_challenge_passed: "Passed an extra security check",
  step_up_challenge_failed: "Failed an extra security check",
  guest_portal_view_as: "Previewed the guest portal as a guest",
  "booking.backdated_created": "Created a booking with a check-in date in the past (override)",
  "guest.records_merged": "Merged two guest records into one",
  "maintenance_block.deleted": "Deleted a maintenance block",
  "maintenance_block.resolved": "Marked a maintenance block resolved",
};

/** Events worth flagging even when nothing is on fire. */
const SENSITIVE = new Set([
  "role_changed",
  "permission_changed",
  "staff_deactivated",
  "staff_session_revoked",
  "security_setting_changed",
  "mfa_policy_changed",
  "mfa_disabled",
  "booking.backdated_created",
  "guest.records_merged",
]);

type Entry = {
  id: string;
  at: string;
  kind: "booking" | "audit";
  /** Who did it, already resolved to a name/email. */
  actor: string;
  actorRole: string | null;
  /** Plain-English one-liner. */
  what: string;
  reason: string | null;
  bookingId: string | null;
  severity: string;
  sensitive: boolean;
  details: Record<string, unknown>;
};

function toneFor(e: Entry) {
  if (e.severity === "critical" || e.severity === "high") return "text-rose-600 dark:text-rose-400";
  if (e.sensitive || e.severity === "warning" || e.severity === "medium")
    return "text-amber-600 dark:text-amber-400";
  return "text-foreground";
}

function WhenLabel({ iso }: { iso: string }) {
  return (
    <span className="text-muted-foreground shrink-0 whitespace-nowrap text-xs">
      {formatDistanceToNow(new Date(iso), { addSuffix: true })} ·{" "}
      {formatInPropertyTimezone(iso, "time")}
    </span>
  );
}

export function StaffActivity() {
  const { isAdmin } = useAuth();
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("168");
  const [selected, setSelected] = useState<Entry | null>(null);
  const windowDef = WINDOWS.find((w) => w.key === win)!;
  const since = useMemo(
    () => new Date(Date.now() - windowDef.hours * 3600_000).toISOString(),
    [windowDef.hours],
  );

  /** Booking state changes — the "who moved this booking" half. */
  const stateLog = useQuery({
    queryKey: ["staff-activity-state-log", win],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_state_log")
        .select("id, created_at, booking_id, from_state, to_state, reason, changed_by")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  /** Role changes, overrides, deletions — the security half. */
  const auditLog = useQuery({
    queryKey: ["staff-activity-audit", win],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_audit_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const isLoading = stateLog.isLoading || auditLog.isLoading;
  const isFetching = stateLog.isFetching || auditLog.isFetching;
  const refetch = () => {
    stateLog.refetch();
    auditLog.refetch();
  };

  /** Resolve every actor id we saw into a real name. */
  const actorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of stateLog.data ?? []) if (r.changed_by) ids.add(r.changed_by as string);
    for (const r of auditLog.data ?? []) {
      if ((r as any).actor_id) ids.add((r as any).actor_id as string);
      if ((r as any).target_user_id) ids.add((r as any).target_user_id as string);
    }
    return Array.from(ids);
  }, [stateLog.data, auditLog.data]);

  const { data: people } = useQuery({
    queryKey: ["staff-activity-people", actorIds.sort().join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", actorIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of data ?? [])
        map.set(p.user_id as string, (p.full_name as string) || (p.email as string) || "Someone");
      return map;
    },
  });

  /** Booking labels so rows read "Arvid Kestens · LMT-2026-0142". */
  const bookingIds = useMemo(
    () =>
      Array.from(
        new Set((stateLog.data ?? []).map((r) => r.booking_id).filter(Boolean)),
      ) as string[],
    [stateLog.data],
  );

  const { data: bookingLabels } = useQuery({
    queryKey: ["staff-activity-bookings", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, confirmation_number, manual_guest_name, profiles:guest_id(full_name)")
        .in("id", bookingIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const b of (data ?? []) as any[]) {
        const name = b.profiles?.full_name || b.manual_guest_name || "Guest";
        map.set(b.id, b.confirmation_number ? `${name} · ${b.confirmation_number}` : name);
      }
      return map;
    },
  });

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    for (const r of stateLog.data ?? []) {
      const who = r.changed_by ? (people?.get(r.changed_by as string) ?? "A staff member") : "The system (automatic)";
      const from = STATE_WORDS[r.from_state as string] ?? r.from_state ?? "new";
      const to = STATE_WORDS[r.to_state as string] ?? r.to_state;
      const label = r.booking_id ? bookingLabels?.get(r.booking_id as string) : null;
      out.push({
        id: `state:${r.id}`,
        at: r.created_at as string,
        kind: "booking",
        actor: who,
        actorRole: null,
        what: `Moved ${label ?? "a booking"} from ${from} to ${to}`,
        reason: (r.reason as string) ?? null,
        bookingId: (r.booking_id as string) ?? null,
        severity: r.to_state === "cancelled" || r.to_state === "no_show" ? "medium" : "info",
        sensitive: r.to_state === "cancelled" || r.to_state === "no_show",
        details: { from_state: r.from_state, to_state: r.to_state },
      });
    }

    for (const r of (auditLog.data ?? []) as any[]) {
      const who = r.actor_email || (r.actor_id ? people?.get(r.actor_id) : null) || "A staff member";
      const target = r.target_user_id ? people?.get(r.target_user_id) : null;
      const base = AUDIT_WORDS[r.event_type] ?? r.event_type;
      out.push({
        id: `audit:${r.id}`,
        at: r.created_at,
        kind: "audit",
        actor: who,
        actorRole: r.actor_role ?? null,
        what: target ? `${base} — ${target}` : base,
        reason: r.reason ?? null,
        bookingId: (r.metadata?.booking_id as string) ?? null,
        severity: r.severity ?? "info",
        sensitive: SENSITIVE.has(r.event_type),
        details: r.metadata ?? {},
      });
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [stateLog.data, auditLog.data, people, bookingLabels]);

  const sensitiveCount = entries.filter((e) => e.sensitive).length;

  /** One line at the top that says whether anything needs a second look. */
  const headline = useMemo(() => {
    if (entries.length === 0)
      return `Nobody on the team touched a booking or a setting in ${windowDef.phrase}.`;
    const staff = new Set(entries.map((e) => e.actor)).size;
    if (sensitiveCount === 0)
      return `${entries.length} action${entries.length === 1 ? "" : "s"} by ${staff} ${
        staff === 1 ? "person" : "people"
      } in ${windowDef.phrase}. Nothing out of the ordinary.`;
    return `${entries.length} action${entries.length === 1 ? "" : "s"} by ${staff} ${
      staff === 1 ? "person" : "people"
    } in ${windowDef.phrase}, including ${sensitiveCount} worth a second look (cancellations, role changes, overrides).`;
  }, [entries, sensitiveCount, windowDef.phrase]);

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Who on the team did what
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{headline}</p>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refetch}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Pulling the team's activity…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing logged in this stretch. Widen the window above to look further back.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Tap any line to see the full story — who did it, what their job role was, the reason
              they gave, and the booking it touched.
            </p>
            <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
              {entries.slice(0, 120).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelected(e)}
                  className="w-full flex items-start justify-between gap-3 text-xs py-1.5 border-b last:border-0 text-left hover:bg-accent/40 rounded-sm px-1 -mx-1 transition-colors"
                >
                  <span className="min-w-0 flex items-start gap-2">
                    {e.kind === "booking" ? (
                      <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <UserCog className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className={`block truncate ${toneFor(e)}`}>{e.what}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        by {e.actor}
                        {e.actorRole ? ` (${e.actorRole})` : ""}
                      </span>
                    </span>
                  </span>
                  <WhenLabel iso={e.at} />
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{selected?.what}</DialogTitle>
            <DialogDescription>
              {selected ? (
                <>
                  {formatDistanceToNow(new Date(selected.at), { addSuffix: true })} ·{" "}
                  {formatInPropertyTimezone(selected.at, "datetime")} Thailand time
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Who did it
                </p>
                <p>{selected.actor}</p>
                {selected.actorRole && (
                  <Badge variant="outline" className="text-[11px]">
                    {selected.actorRole}
                  </Badge>
                )}
                {selected.actor.startsWith("The system") && (
                  <p className="text-xs text-muted-foreground">
                    No person did this — an automatic rule fired (expired hold, scheduled cleanup,
                    or a payment coming in).
                  </p>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reason they gave
                </p>
                <p className={selected.reason ? "" : "text-muted-foreground"}>
                  {selected.reason ?? "No reason was written down for this one."}
                </p>
              </div>

              {selected.bookingId && (
                <div className="rounded-md border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Booking it touched
                  </p>
                  <Link
                    to={`/bookings?id=${selected.bookingId}`}
                    className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                  >
                    Open the booking
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}

              {Object.keys(selected.details).length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Everything else recorded
                  </p>
                  <dl className="space-y-1">
                    {Object.entries(selected.details).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-3 text-xs">
                        <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                        <dd className="text-right break-all">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
