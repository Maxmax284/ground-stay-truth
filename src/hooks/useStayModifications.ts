/**
 * Modify Stay — data access.
 *
 * Reads the stay's inventory legs (`booking_segments`) and its change history
 * (`stay_modifications`), and calls the `modify-stay` edge function for both
 * the availability preview and the commit. Availability and money authority
 * live on the server; this hook only carries the request.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { DraftSegment, ModificationKind } from "@/lib/modifyStay";

export interface BookingSegment {
  id: string;
  booking_id: string;
  unit_id: string;
  starts_on: string;
  ends_on: string;
  status: string;
  modification_id: string | null;
  created_at: string;
}

export interface StayModification {
  id: string;
  booking_id: string;
  kind: string;
  reason_code: string;
  notes: string | null;
  pricing_before: number;
  pricing_after: number;
  calculated_amount: number;
  waived_amount: number;
  final_amount: number;
  status: string;
  payment_status: string;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
  before_snapshot: any;
  after_snapshot: any;
}

export function useBookingSegments(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking-segments", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_segments" as any)
        .select("*")
        .eq("booking_id", bookingId as string)
        .order("starts_on", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BookingSegment[];
    },
  });
}

export function useStayModifications(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["stay-modifications", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stay_modifications" as any)
        .select("*")
        .eq("booking_id", bookingId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StayModification[];
    },
  });
}

export interface ModifyStayConflict {
  unit_id: string;
  unit_name: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  detail: string;
}

export interface ModifyStayRequest {
  action: "preview" | "commit";
  bookingId: string;
  segments: DraftSegment[];
  kind?: ModificationKind;
  reasonCode?: string;
  notes?: string;
  pricingBefore?: number;
  pricingAfter?: number;
  waivedAmount?: number;
  requestPayment?: boolean;
  force?: boolean;
  quote?: unknown;
  /** Stored booking total at the time of the change, for drift reporting. */
  onRecordTotal?: number;
  /** "preserve" keeps the stored total and adds only the clean change delta. */
  pricingMode?: "preserve" | "full_reprice";
  changeDelta?: number;
}

export interface ModifyStayResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  conflicts?: ModifyStayConflict[];
  modification?: StayModification;
  new_total?: number;
  base_total?: number;
  carried_adjustments?: Array<{ label: string; value_type: "percent" | "fixed"; value: number; amount: number }>;
  calculated_amount?: number;
  waived_amount?: number;
  final_amount?: number;
  payment_link?: { url?: string; amount?: number; email_sent?: boolean } | null;
  payment_link_error?: string | null;
  status?: number;
}

export function useModifyStay() {
  const { session } = useAuth();
  const qc = useQueryClient();

  return useMutation<ModifyStayResponse, Error, ModifyStayRequest>({
    mutationFn: async (req) => {
      if (!session) throw new Error("You need to be signed in.");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modify-stay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: req.action,
          booking_id: req.bookingId,
          segments: req.segments.map((s) => ({
            unit_id: s.unit_id,
            starts_on: s.starts_on,
            ends_on: s.ends_on,
          })),
          kind: req.kind,
          reason_code: req.reasonCode,
          notes: req.notes,
          pricing_before: req.pricingBefore,
          pricing_after: req.pricingAfter,
          waived_amount: req.waivedAmount,
          request_payment: req.requestPayment,
          force: req.force,
          quote: req.quote,
          on_record_total: req.onRecordTotal,
          pricing_mode: req.pricingMode,
          change_delta: req.changeDelta,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as ModifyStayResponse;
      return { ...json, status: resp.status };
    },
    onSuccess: (_data, req) => {
      if (req.action !== "commit") return;
      qc.invalidateQueries({ queryKey: ["booking-segments", req.bookingId] });
      qc.invalidateQueries({ queryKey: ["stay-modifications", req.bookingId] });
      qc.invalidateQueries({ queryKey: ["booking", req.bookingId] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking-payments", req.bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-adjustments", req.bookingId] });
      qc.invalidateQueries({ queryKey: ["calendar-bookings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
