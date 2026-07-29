/**
 * Guest Directory data layer.
 *
 * One row per person (registered profiles + manual walk-in guests), aggregated
 * server-side by `get_guest_directory()`. All reads are staff-gated in the DB —
 * this hook never assembles PII client-side from raw booking rows.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GuestDirectoryRow {
  guest_key: string;
  guest_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  is_linked: boolean;
  total_bookings: number;
  completed_stays: number;
  upcoming_stays: number;
  cancelled_bookings: number;
  in_house: boolean;
  next_check_in: string | null;
  last_check_out: string | null;
  total_nights: number;
  lifetime_spend: number;
  outstanding_balance: number;
  first_seen: string;
}

export interface GuestBookingRow {
  booking_id: string;
  confirmation_number: string | null;
  unit_name: string | null;
  state: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number | null;
  paid: number;
  owed: number;
  created_at: string;
}

export type GuestStatus =
  | "in_house"
  | "arriving_soon"
  | "upcoming"
  | "past"
  | "inquiry_only"
  | "cancelled_only";

/** Derive a single operational status chip for a directory row. */
export function guestStatus(g: GuestDirectoryRow): GuestStatus {
  if (g.in_house) return "in_house";
  if (g.next_check_in) {
    const days =
      (new Date(g.next_check_in).getTime() - Date.now()) / 86_400_000;
    return days <= 7 ? "arriving_soon" : "upcoming";
  }
  if (g.completed_stays > 0 || g.last_check_out) return "past";
  if (g.total_bookings > 0 && g.cancelled_bookings === g.total_bookings)
    return "cancelled_only";
  return "inquiry_only";
}

export function useGuestDirectory() {
  return useQuery<GuestDirectoryRow[]>({
    queryKey: ["guest-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_guest_directory");
      if (error) throw error;
      return (data ?? []) as GuestDirectoryRow[];
    },
    staleTime: 60_000,
  });
}

export function useGuestBookings(guestKey: string | null) {
  return useQuery<GuestBookingRow[]>({
    queryKey: ["guest-bookings", guestKey],
    enabled: !!guestKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_guest_bookings", {
        _guest_key: guestKey!,
      });
      if (error) throw error;
      return (data ?? []) as GuestBookingRow[];
    },
  });
}

export function useGuestNotes(guestKey: string | null) {
  return useQuery({
    queryKey: ["guest-notes", guestKey],
    enabled: !!guestKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_notes")
        .select("*")
        .eq("guest_key", guestKey!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddGuestNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      guestKey: string;
      guestId: string | null;
      note: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("guest_notes").insert({
        guest_key: input.guestKey,
        guest_id: input.guestId,
        note: input.note,
        created_by: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["guest-notes", v.guestKey] }),
  });
}

/** Admin-only. Folds a duplicate record into a registered guest account. */
export function useMergeGuests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sourceKey: string; targetKey: string }) => {
      const { data, error } = await supabase.rpc("merge_guest_records", {
        _source_key: input.sourceKey,
        _target_key: input.targetKey,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guest-directory"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

/**
 * Flags likely duplicates: same normalized email or phone across distinct keys.
 * Advisory only — merging stays a deliberate admin action.
 */
export function findDuplicateKeys(rows: GuestDirectoryRow[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const r of rows) {
    for (const raw of [r.email, r.phone]) {
      const v = raw?.trim().toLowerCase().replace(/[\s-]/g, "");
      if (!v) continue;
      seen.set(v, [...(seen.get(v) ?? []), r.guest_key]);
    }
  }
  const dupes = new Set<string>();
  for (const keys of seen.values()) {
    const uniq = [...new Set(keys)];
    if (uniq.length > 1) uniq.forEach((k) => dupes.add(k));
  }
  return dupes;
}
