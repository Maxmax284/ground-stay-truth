/**
 * Data plumbing for the Price Story badge.
 *
 * Two entry points on purpose:
 *
 *  - `useBookingDiscountFlags(ids)` — ONE query for a whole list/calendar. Says
 *    only "this booking has a human adjustment on it, worth ฿X". Cheap enough
 *    to put a badge on every row.
 *  - `usePriceStory(booking, enabled)` — the full receipt. Re-quotes the stay
 *    from scratch, so it only runs when a popover actually opens.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUnits } from "@/hooks/useUnits";
import { usePricingRules } from "@/hooks/usePricingRules";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useBookingSegments } from "@/hooks/useStayModifications";
import { quoteSegments, type DraftSegment } from "@/lib/modifyStay";
import { buildPriceStory, activeAdjustments, type PriceStory, type AdjustmentRow } from "@/lib/priceStory";

export interface DiscountFlag {
  /** Number of active discretionary adjustments. */
  count: number;
  /** Net signed amount: negative = discount, positive = surcharge. */
  net: number;
  hasDiscount: boolean;
  hasSurcharge: boolean;
}

/** Batch lookup so a 50-row list still costs one round trip. */
export function useBookingDiscountFlags(bookingIds: (string | null | undefined)[]) {
  const ids = useMemo(
    () => Array.from(new Set(bookingIds.filter(Boolean) as string[])).sort(),
    [bookingIds]
  );

  const { data } = useQuery({
    queryKey: ["booking-discount-flags", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_adjustments")
        .select("booking_id, adjustment_type, amount_calculated, status")
        .in("booking_id", ids)
        .eq("status", "active");
      if (error) throw error;
      const map: Record<string, DiscountFlag> = {};
      for (const row of data ?? []) {
        const key = (row as any).booking_id as string;
        const amt = Math.abs(Number((row as any).amount_calculated ?? 0));
        const isDiscount = ((row as any).adjustment_type ?? "discount") === "discount";
        const cur = map[key] ?? { count: 0, net: 0, hasDiscount: false, hasSurcharge: false };
        cur.count += 1;
        cur.net += isDiscount ? -amt : amt;
        cur.hasDiscount = cur.hasDiscount || isDiscount;
        cur.hasSurcharge = cur.hasSurcharge || !isDiscount;
        map[key] = cur;
      }
      return map;
    },
  });

  // Shaped like a react-query result so call sites can `const { data } = ...`.
  return { data: data ?? ({} as Record<string, DiscountFlag>) };
}

export interface PriceStoryBooking {
  id: string;
  unit_id?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  num_guests?: number | null;
  total_price?: number | null;
  guest_id?: string | null;
}

/** The full receipt. Keep `enabled` false until the user asks to see it. */
export function usePriceStory(booking: PriceStoryBooking | null | undefined, enabled: boolean) {
  const bookingId = booking?.id ?? null;
  const on = enabled && !!bookingId;

  const { data: units } = useUnits();
  const { data: pricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();
  const { data: segments } = useBookingSegments(on ? bookingId : null);

  const { data: adjustments } = useQuery({
    queryKey: ["booking-adjustments", bookingId],
    enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_adjustments")
        .select("*")
        .eq("booking_id", bookingId as string)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AdjustmentRow[];
    },
  });

  // Loyalty tier depends on how many stays this guest has finished.
  // Only `completed` counts — a checked_in booking must never count itself,
  // and the booking being quoted is always excluded.
  const { data: completedStays } = useQuery({
    queryKey: ["price-story-completed-stays", booking?.guest_id ?? null, bookingId],
    enabled: on && !!booking?.guest_id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("guest_id", booking!.guest_id as string)
        .eq("state", "completed")
        .neq("id", bookingId as string);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const actorIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of activeAdjustments(adjustments)) if (a.applied_by) set.add(a.applied_by);
    return Array.from(set).sort();
  }, [adjustments]);

  const { data: actors } = useQuery({
    queryKey: ["price-story-actors", actorIds.join(",")],
    enabled: on && actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", actorIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        map[(p as any).user_id] = (p as any).full_name || (p as any).email || "staff";
      }
      return map;
    },
  });

  const story: PriceStory | null = useMemo(() => {
    if (!on || !booking || !units) return null;

    const active = (segments ?? []).filter((s: any) => s.status === "active" || s.status === "pending");
    const draft: DraftSegment[] = active.length
      ? active.map((s: any) => ({
          key: `seg-${s.id}`,
          id: s.id,
          unit_id: s.unit_id,
          starts_on: s.starts_on,
          ends_on: s.ends_on,
        }))
      : booking.unit_id && booking.check_in && booking.check_out
        ? [{ key: "legacy", unit_id: booking.unit_id, starts_on: booking.check_in, ends_on: booking.check_out }]
        : [];

    if (draft.length === 0) return null;

    const quote = quoteSegments(
      draft,
      units ?? [],
      (pricingRules ?? []) as any,
      policies,
      booking.num_guests ?? 1,
      completedStays ?? 0
    );

    return buildPriceStory({
      quote,
      adjustments,
      storedTotal: booking.total_price ?? null,
      policies,
      actorName: (id) => (id ? (actors?.[id] ?? "staff") : "system"),
    });
  }, [on, booking, units, pricingRules, policies, segments, adjustments, completedStays, actors]);

  return { story, policies, isLoading: on && !story };
}
