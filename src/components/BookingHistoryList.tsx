/**
 * Booking history — read-only audit list of stays: dates, room, stored price
 * and an on-demand discount breakdown. Changes nothing.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Search, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/hooks/useProperty";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { usePriceStory, useBookingDiscountFlags } from "@/hooks/usePriceStory";
import { formatPrice } from "@/lib/currency";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE = 100;
type Scope = "past" | "all";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function nights(a?: string | null, b?: string | null) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}
function todayBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export function BookingHistoryList({ compact = false }: { compact?: boolean }) {
  const { activePropertyId } = useProperty();
  const { data: policies } = usePolicySettings();
  const [scope, setScope] = useState<Scope>("past");
  const [q, setQ] = useState("");

  const query = useInfiniteQuery({
    queryKey: ["booking-history", activePropertyId, scope],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let qb = (supabase
        .from("bookings")
        .select("id, unit_id, check_in, check_out, num_guests, total_price, guest_id, state, manual_guest_name, manual_guest_email, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .order("check_in", { ascending: false })
        .range(pageParam, pageParam + PAGE - 1)) as any;
      if (activePropertyId) qb = qb.eq("property_id", activePropertyId);
      if (scope === "past") qb = qb.lte("check_out", todayBkk());
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  const rows = useMemo(() => (query.data?.pages ?? []).flat(), [query.data]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((b) =>
      [resolveGuestDisplayName(b), b.units?.name, b.profiles?.email, b.id].some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [rows, q]);
  const { data: flags } = useBookingDiscountFlags(filtered.map((b) => b.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest, room or booking ID" className="pl-8" />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={scope === "past" ? "default" : "outline"} onClick={() => setScope("past")}>Past stays</Button>
          <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>All</Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : query.error ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">Couldn't load booking history: {(query.error as Error).message}</p>
      ) : filtered.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">No stays match.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((b) => <HistoryRow key={b.id} b={b} policies={policies} flag={flags[b.id]} compact={compact} />)}
        </ul>
      )}

      {query.hasNextPage && (
        <Button variant="outline" size="sm" className="w-full" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Loading…" : "Load older stays"}
        </Button>
      )}
    </div>
  );
}

function HistoryRow({ b, policies, flag, compact }: { b: any; policies: any; flag?: { net: number; count: number }; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const { story } = usePriceStory(b, open);
  const fmt = (n: number) => formatPrice(Math.abs(n), policies);
  const n = nights(b.check_in, b.check_out);

  return (
    <li className="rounded-md border border-border/60 bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">{resolveGuestDisplayName(b)}</span>
            <Badge className={cn("text-[10px]", STATE_VARIANTS[b.state as BookingState])}>{String(b.state).replace(/_/g, " ")}</Badge>
            {flag && flag.count > 0 && (
              <Badge variant="outline" className="text-[10px]">{flag.net < 0 ? "Discount" : "Surcharge"} {fmt(flag.net)}</Badge>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {b.units?.name ?? "No room"} · {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {n} night{n === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums font-medium">{b.total_price != null ? formatPrice(b.total_price, policies) : "—"}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-border/60 p-3 text-xs">
          {!story ? (
            <p className="text-muted-foreground">Working out the breakdown…</p>
          ) : (
            <>
              {story.lines.map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div>{l.label}</div>
                    {l.detail && <div className="text-[10px] text-muted-foreground">{l.detail}</div>}
                  </div>
                  <span className="shrink-0 tabular-nums">{l.amount < 0 ? "−" : ""}{fmt(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border/60 pt-1.5 font-medium">
                <span>Total on record</span>
                <span className="tabular-nums">{b.total_price != null ? formatPrice(b.total_price, policies) : "—"}</span>
              </div>
              {Math.abs(story.drift) >= 1 && (
                <p className="rounded bg-muted/50 p-2 text-[10px] text-muted-foreground">
                  The breakdown uses today's rates ({fmt(story.chargedTotal)}). The total on record is what was actually charged, and it's the one that counts.
                </p>
              )}
            </>
          )}
          {!compact && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to={`/bookings/${b.id}/status`}><Eye className="mr-1 h-3.5 w-3.5" />Open booking status</Link>
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
