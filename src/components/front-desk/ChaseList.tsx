/**
 * Chase list — every guest arriving today, already arrived, in-house, or
 * arriving in the next 7 days, with readiness + last portal activity.
 * Read-only: chasing is always a human action via the Status page / chat.
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
import { Skeleton } from "@/components/ui/skeleton";
import { BookingReadinessRow } from "@/components/BookingReadinessRow";
import { useBookingReadiness, type BookingReadiness } from "@/hooks/useBookingReadiness";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";

type Bucket = "arriving" | "arrived" | "staying" | "upcoming";

const KEYS: Array<keyof BookingReadiness> = ["openedPortal", "paid", "flightAdded", "idUploaded", "messaged"];

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

  const { data: readiness, isError: readinessError } = useBookingReadiness(rows.map((r) => r.b));
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

  const sorted = useMemo(() => {
    const order: Record<Bucket, number> = { arriving: 0, arrived: 1, upcoming: 2, staying: 3 };
    const missing = (id: string) => (readiness?.[id] ? KEYS.filter((k) => !readiness[id][k]).length : 0);
    return [...rows].sort(
      (a, z) => order[a.bucket] - order[z.bucket] || a.b.check_in.localeCompare(z.b.check_in) || missing(z.b.id) - missing(a.b.id),
    );
  }, [rows, readiness]);

  const bucketLabel: Record<Bucket, string> = {
    arriving: t("chaseList.arriving", "Arriving today"),
    arrived: t("chaseList.arrived", "Arrived, not checked in"),
    upcoming: t("chaseList.upcoming", "Next 7 days"),
    staying: t("chaseList.staying", "In house"),
  };

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{t("chaseList.empty", "No guests arriving or staying right now.")}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("chaseList.hint", "Everyone arriving soon or in house. Grey icons = not done yet. Nothing here changes a booking.")}
      </p>
      {readinessError && (
        <p className="text-xs text-destructive">{t("chaseList.readinessError", "Couldn't load readiness — refresh before chasing anyone.")}</p>
      )}
      {sorted.map(({ b, bucket }) => {
        const r = readiness?.[b.id];
        const missing = r ? KEYS.filter((k) => !r[k]).length : null;
        const last = lastActivity?.[b.id];
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
