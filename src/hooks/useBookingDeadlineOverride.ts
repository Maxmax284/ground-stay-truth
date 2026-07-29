import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * BUSINESS-CRITICAL — staff override of a booking's hold / deposit deadline.
 *
 * Writes an explicit `hold_deadline_at` on the booking (or clears it to fall
 * back to policy timing) and records who did it and why. Every override is
 * also written to booking_state_log so it shows in the Staff Activity panel.
 */
export function useOverrideBookingDeadline() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bookingId,
      hours,
      reason,
      state,
    }: {
      bookingId: string;
      /** Hours from now; null clears the override back to policy timing. */
      hours: number | null;
      reason: string;
      state?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      const newDeadline = hours == null ? null : new Date(Date.now() + hours * 3600_000).toISOString();

      const { error } = await (supabase.from("bookings") as any)
        .update({
          hold_deadline_at: newDeadline,
          deadline_override_reason: hours == null ? null : reason,
          deadline_override_by: hours == null ? null : userId,
          deadline_override_at: hours == null ? null : new Date().toISOString(),
        })
        .eq("id", bookingId);
      if (error) throw error;

      // Audit trail — same timeline staff already read for state changes.
      await supabase.from("booking_state_log").insert({
        booking_id: bookingId,
        from_state: (state ?? "soft_hold") as any,
        to_state: (state ?? "soft_hold") as any,
        changed_by: userId,
        reason:
          hours == null
            ? `Deadline override cleared — back to standard policy timing`
            : `Deadline extended by ${hours}h — ${reason}`,
      });

      try {
        await (supabase.rpc as any)("log_staff_audit_event", {
          _event_type: hours == null ? "booking_deadline_override_cleared" : "booking_deadline_override",
          _severity: "info",
          _actor_id: userId,
          _target_user_id: null,
          _reason: reason,
          _metadata: { booking_id: bookingId, hours, new_deadline: newDeadline },
        });
      } catch {
        /* audit is best-effort; the state log above is the source of truth */
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking", vars.bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-state-log", vars.bookingId] });
    },
  });
}
