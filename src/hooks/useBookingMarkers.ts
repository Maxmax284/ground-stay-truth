/**
 * Staff markers write path — "paying on arrival" and "handled offline".
 *
 * Every write is attributed through the override audit trail so the Monitoring
 * Center "who did what" panel picks it up with no extra wiring.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logOverrideEvent } from "@/lib/overrideAudit";
import {
  readOfflineAcks,
  OFFLINE_ACK_LABELS,
  type OfflineAckItem,
} from "@/lib/staffMarkers";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["booking"] });
  qc.invalidateQueries({ queryKey: ["bookings"] });
  qc.invalidateQueries({ queryKey: ["front-desk"] });
}

/** Toggle "guest is paying on arrival" on a booking. */
export function useSetPayOnArrival() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      value,
      reason,
    }: {
      bookingId: string;
      value: boolean;
      reason?: string;
    }) => {
      const { data: before } = await supabase
        .from("bookings")
        .select("pay_on_arrival")
        .eq("id", bookingId)
        .maybeSingle();

      const { error } = await supabase
        .from("bookings")
        .update({ pay_on_arrival: value } as any)
        .eq("id", bookingId);
      if (error) throw error;

      await logOverrideEvent({
        actionType: value ? "pay_on_arrival_set" : "pay_on_arrival_cleared",
        targetType: "booking",
        targetId: bookingId,
        bookingId,
        beforeState: { pay_on_arrival: (before as any)?.pay_on_arrival ?? false },
        afterState: { pay_on_arrival: value },
        reason:
          reason?.trim() ||
          (value
            ? "Guest is settling payment on arrival"
            : "Pay-on-arrival marker removed"),
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.value ? "Marked as paying on arrival" : "Pay-on-arrival marker cleared",
      );
      invalidate(qc);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that"),
  });
}

/** Record (or clear) a "handled offline" acknowledgement for one item. */
export function useSetOfflineAcknowledgement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { profile: profileQuery } = useProfile();
  const profile = profileQuery.data;

  return useMutation({
    mutationFn: async ({
      bookingId,
      item,
      value,
      reason,
    }: {
      bookingId: string;
      item: OfflineAckItem;
      value: boolean;
      reason?: string;
    }) => {
      const { data: row, error: readErr } = await supabase
        .from("bookings")
        .select("offline_acknowledgements")
        .eq("id", bookingId)
        .maybeSingle();
      if (readErr) throw readErr;

      const current = readOfflineAcks((row as any)?.offline_acknowledgements);
      const next: Record<string, any> = { ...current };

      if (value) {
        next[item] = {
          at: new Date().toISOString(),
          by: profile?.full_name ?? user?.email ?? null,
          reason: reason?.trim() || null,
        };
      } else {
        delete next[item];
      }

      const { error } = await supabase
        .from("bookings")
        .update({ offline_acknowledgements: next } as any)
        .eq("id", bookingId);
      if (error) throw error;

      await logOverrideEvent({
        actionType: value ? "offline_acknowledgement_set" : "offline_acknowledgement_cleared",
        targetType: "booking",
        targetId: bookingId,
        bookingId,
        beforeState: { [item]: current[item] ? "confirmed offline" : "not confirmed" },
        afterState: { [item]: value ? "confirmed offline" : "not confirmed" },
        reason: reason?.trim() || `${OFFLINE_ACK_LABELS[item]}`,
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.value
          ? `${OFFLINE_ACK_LABELS[vars.item]} — recorded`
          : "Offline confirmation removed",
      );
      invalidate(qc);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that"),
  });
}
