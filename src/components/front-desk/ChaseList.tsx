/**
 * Chase list — every guest arriving today, already arrived, in-house, or
 * arriving in the next 7 days, with readiness, attention chips and last
 * portal activity. Sorted by urgency: what's on fire first, then soonest
 * arrival. Read-only: chasing is always a human action via Status / chat.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { ClipboardList, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookingReadinessRow } from "@/components/BookingReadinessRow";
import { useBookingReadiness, type BookingReadiness } from "@/hooks/useBookingReadiness";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";

type Bucket = "arriving" | "arrived" | "staying" | "upcoming";

const KEYS: Array<keyof BookingReadiness> = ["openedPortal", "paid", "flightAdded", "idUploaded", "messaged"];

type ChipKey = "noFlight" | "idMissing" | "emailBounced" | "paymentIncomplete" | "replyNeeded";

/** Urgency weight per chip — higher floats to the top. */
const CHIP_WEIGHT: Record<ChipKey, number> = {
  replyNeeded: 5,
  emailBounced: 4,
  paymentIncomplete: 3,
  idMissing: 2,
  noFlight: 1,
};

interface ChaseSignals {
  /** Guest email bounced / complained / failed recently. */
  emailBounced: boolean;
  /** Latest guest message has no staff reply after it. */
  replyNeeded: boolean;
}

function guestEmail(b: FrontDeskBooking): string | null {
  return (b.profiles?.email ?? b.manual_guest_email ?? null)?.toLowerCase() ?? null;
}

/**
 * Batched per-booking chase signals: email deliverability failures and
 * unanswered guest messages. Two chunked queries, no per-card fan-out.
 * Errors throw so a failed lookup shows no chips instead of false ones.
 */
function useChaseSignals(bookings: FrontDeskBooking[]) {
  const ids = bookings.map((b) => b.id);
  const emailByBooking = new Map(bookings.map((b) => [b.id, guestEmail(b)]));
  const guestByBooking = new Map(bookings.map((b) => [b.id, b.guest_id ?? null]));

  return useQuery({
    queryKey: ["chase-signals", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ChaseSignals>> => {
      const result: Record<string, ChaseSignals> = {};
      for (const id of ids) result[id] = { emailBounced: false, replyNeeded: false };

      const CHUNK = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      const emails = [...new Set([...emailByBooking.values()].filter((e): e is string => !!e))];
      const emailChunks: string[][] = [];
      for (let i = 0; i < emails.length; i += CHUNK) emailChunks.push(emails.slice(i, i + CHUNK));

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const responses = await Promise.all([
        // Recent failed/bounced sends per guest email
        ...emailChunks.map((chunk) =>
          supabase
            .from("email_send_log")
            .select("recipient_email, status")
            .in("recipient_email", chunk)
            .in("status", ["failed", "bounced", "error"])
            .gte("created_at", since)
            .limit(10000),
        ),
        // Messages per booking to find unanswered guest messages
        ...chunks.map((chunk) =>
          supabase
            .from("messages")
            .select("booking_id, sender_id, created_at")
            .in("booking_id", chunk)
            .eq("is_internal", false)
            .is("external_ref", null)
            .order("created_at", { ascending: false })
            .limit(10000),
        ),
      ]);
      for (const res of responses) if (res.error) throw res.error;

      const bouncedEmails = new Set<string>();
      for (const res of responses.slice(0, emailChunks.length)) {
        for (const row of (res.data ?? []) as Array<Record<string, any>>) {
          if (row.recipient_email) bouncedEmails.add(String(row.recipient_email).toLowerCase());
        }
      }
      for (const [bookingId, email] of emailByBooking) {
        if (email && bouncedEmails.has(email) && result[bookingId]) result[bookingId].emailBounced = true;
      }

      // Messages arrive newest-first per booking: the first row we see is the
      // latest. If it's from the guest, staff still owe a reply.
      const seen = new Set<string>();
      for (const res of responses.slice(emailChunks.length)) {
        for (const row of (res.data ?? []) as Array<Record<string, any>>) {
          if (!row.booking_id || seen.has(row.booking_id) || !result[row.booking_id]) continue;
          seen.add(row.booking_id);
          if (row.sender_id && row.sender_id === guestByBooking.get(row.booking_id)) {
            result[row.booking_id].replyNeeded = true;
          }
        }
      }

      return result;
    },
  });
}

export function ChaseList({
  sections,
  onOpen,
}: {
  sections: {
    arrivingToday: FrontDeskBooking[];
    arrivedNotCheckedIn: FrontDeskBooking[];
    currentlyStaying: FrontDeskBooking[];
    upcoming: FrontDeskBooking[];
  };
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ b: FrontDeskBooking; bucket: Bucket }> = [];
    const add = (list: FrontDeskBooking[], bucket: Bucket) => {
      for (const b of list) if (!seen.has(b.id)) { seen.add(b.id); out.push({ b, bucket }); }
    };
    add(sections.arrivingToday, "arriving");
    add(sections.arrivedNotCheckedIn, "arrived");
    add(sections.upcoming, "upcoming");
    add(sections.currentlyStaying, "staying");
    return out;
  }, [sections]);

  const bookings = rows.map((r) => r.b);
  const { data: readiness, isError: readinessError } = useBookingReadiness(bookings);
  const { data: signals, isError: signalsError } = useChaseSignals(bookings);
  const ids = rows.map((r) => r.b.id);

  const { data: lastActivity } = useQuery({
    queryKey: ["chase-last-portal-activity", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 50) {
        const { data, error } = await supabase
          .from("guest_portal_activity")
          .select("booking_id, created_at")
          .in("booking_id", ids.slice(i, i + 50))
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) throw error;
        for (const r of data ?? []) if (r.booking_id && !map[r.booking_id]) map[r.booking_id] = r.created_at;
      }
      return map;
    },
  });

  /** Chips for one booking, highest urgency first. */
  const chipsFor = (b: FrontDeskBooking): ChipKey[] => {
    const r = readiness?.[b.id];
    const s = signals?.[b.id];
    const chips: ChipKey[] = [];
    if (s?.replyNeeded) chips.push("replyNeeded");
    if (s?.emailBounced) chips.push("emailBounced");
    if (r && !r.paid) chips.push("paymentIncomplete");
    if (r && !r.idUploaded) chips.push("idMissing");
    if (r && !r.flightAdded) chips.push("noFlight");
    return chips.sort((a, z) => CHIP_WEIGHT[z] - CHIP_WEIGHT[a]);
  };

  const sorted = useMemo(() => {
    const order: Record<Bucket, number> = { arriving: 0, arrived: 1, upcoming: 2, staying: 3 };
    const urgency = (b: FrontDeskBooking) =>
      chipsFor(b).reduce((sum, c) => sum + CHIP_WEIGHT[c], 0);
    return [...rows].sort(
      (a, z) =>
        order[a.bucket] - order[z.bucket] ||
        urgency(z.b) - urgency(a.b) ||
        a.b.check_in.localeCompare(z.b.check_in),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, readiness, signals]);

  const bucketLabel: Record<Bucket, string> = {
    arriving: t("chaseList.arriving", "Arriving today"),
    arrived: t("chaseList.arrived", "Arrived, not checked in"),
    upcoming: t("chaseList.upcoming", "Next 7 days"),
    staying: t("chaseList.staying", "In house"),
  };

  const chipLabel: Record<ChipKey, string> = {
    replyNeeded: t("chaseList.chip.replyNeeded", "Staff reply needed"),
    emailBounced: t("chaseList.chip.emailBounced", "Email bounced"),
    paymentIncomplete: t("chaseList.chip.paymentIncomplete", "Payment incomplete"),
    idMissing: t("chaseList.chip.idMissing", "ID missing"),
    noFlight: t("chaseList.chip.noFlight", "No flight info"),
  };

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{t("chaseList.empty", "No guests arriving or staying right now.")}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("chaseList.hint", "Everyone arriving soon or in house. Grey icons = not done yet. Nothing here changes a booking.")}
      </p>
      {(readinessError || signalsError) && (
        <p className="text-xs text-destructive">{t("chaseList.readinessError", "Couldn't load readiness — refresh before chasing anyone.")}</p>
      )}
      {sorted.map(({ b, bucket }) => {
        const r = readiness?.[b.id];
        const missing = r ? KEYS.filter((k) => !r[k]).length : null;
        const last = lastActivity?.[b.id];
        const chips = chipsFor(b);
        return (
          <div key={b.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <button className="min-w-0 text-left" onClick={() => onOpen(b.id)}>
                <p className="font-medium truncate">{resolveGuestDisplayName(b)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {b.units?.name ?? "—"} · {format(parseISO(b.check_in), "d MMM")} → {format(parseISO(b.check_out), "d MMM")}
                </p>
              </button>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px]">{bucketLabel[bucket]}</Badge>
                {missing !== null && missing > 0 && (
                  <span className="text-[11px] text-muted-foreground">{t("chaseList.missing", "{{count}} to chase", { count: missing })}</span>
                )}
              </div>
            </div>
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {chips.map((c) => (
                  <Badge
                    key={c}
                    variant={c === "replyNeeded" || c === "emailBounced" ? "destructive" : "secondary"}
                    className="text-[10px] font-normal"
                  >
                    {chipLabel[c]}
                  </Badge>
                ))}
              </div>
            )}
            <BookingReadinessRow readiness={r} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground truncate">
                {last
                  ? t("chaseList.lastSeen", "Portal: {{when}}", { when: formatDistanceToNow(new Date(last), { addSuffix: true }) })
                  : t("chaseList.neverSeen", "Portal: never opened")}
              </span>
              <div className="flex gap-1 shrink-0">
                <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                  <Link to={`/messages?booking=${b.id}`}><MessageSquare className="h-3.5 w-3.5" /></Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-7 px-2">
                  <Link to={`/bookings/${b.id}/status`}>
                    <ClipboardList className="h-3.5 w-3.5 mr-1" /> {t("chaseList.status", "Status")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
