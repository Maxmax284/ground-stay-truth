import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { BookingState } from "@/lib/bookingStateMachine";
import { createNotification, createNotifications } from "@/hooks/useNotifications";
import { formatPrice } from "@/lib/currency";
import { calculateOutstanding } from "@/lib/paymentTypes";
import { assertRecordableOfflinePayment, friendlyPaymentError } from "@/lib/offlinePayments";
import { reportOfflinePaymentRejection } from "@/lib/paymentRejectionLog";

import { emitPaymentProcessed, emitRefundIssued } from "@/lib/fenrir/events";
import { useProperty } from "@/hooks/useProperty";
import { logOverrideEvent } from "@/lib/overrideAudit";

export type Booking = Tables<"bookings">;
export type BookingInsert = TablesInsert<"bookings">;
export type BookingStateLog = Tables<"booking_state_log">;
export type Payment = Tables<"payments">;
export type Message = Tables<"messages">;
export type BookingWithJoins = Booking & {
  units: { name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

// ── Bookings list (with unit name join) ──
export function useBookings(filters?: {
  state?: BookingState | null;
  unitId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["bookings", filters, activePropertyId],
    queryFn: async () => {
      let query = (supabase
        .from("bookings")
        .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .order("created_at", { ascending: false })) as any;

      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      if (filters?.state) query = query.eq("state", filters.state);
      if (filters?.unitId) query = query.eq("unit_id", filters.unitId);
      // Overlap semantics, not containment. A stay that starts before the
      // window or ends after it still occupies the room inside the window —
      // e.g. a Sep 12 → Nov 17 stay must appear on a 30-day calendar slice.
      if (filters?.dateTo) query = query.lt("check_in", filters.dateTo);
      if (filters?.dateFrom) query = query.gt("check_out", filters.dateFrom);


      const { data, error } = await query;
      if (error) throw error;
      return data as BookingWithJoins[];
    },
  });
}

// ── Single booking ──
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: ["booking", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("bookings")
        .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .eq("id", id!)
        .single() as any);
      if (error) throw error;
      return data as BookingWithJoins;
    },
  });
}

// ── Create booking ──
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: BookingInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { ...booking, created_by: user?.id ?? null };

      const { data, error } = await supabase.from("bookings").insert(payload).select().single();
      if (error) throw error;

      // Log the initial state
      await supabase.from("booking_state_log").insert({
        booking_id: data.id,
        to_state: data.state,
        changed_by: user?.id ?? null,
        reason: "Booking created",
      });

      // Determine if this is a guest inquiry vs staff-created booking
      const isGuestInquiry = booking.guest_id === user?.id && data.state === "inquiry";

      // Fetch unit name for better notification context
      let unitName = "";
      if (booking.unit_id) {
        const { data: unit } = await supabase
          .from("units")
          .select("name")
          .eq("id", booking.unit_id)
          .single();
        unitName = unit?.name ?? "";
      }

      // Notify admins/managers about new booking
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager"]);

      const notifMessage = isGuestInquiry
        ? `New guest inquiry: ${unitName} ${booking.check_in} – ${booking.check_out} — action needed`
        : `New booking created: ${unitName} ${booking.check_in} – ${booking.check_out}`;

      await createNotifications(
        (admins ?? [])
          .filter((a) => a.user_id !== user?.id)
          .map((a) => ({
            user_id: a.user_id,
            type: "booking",
            reference_id: data.id,
            message: notifMessage,
          }))
      );

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ── Transition state ──
export function useTransitionBookingState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      fromState,
      toState,
      reason,
    }: {
      bookingId: string;
      fromState: BookingState;
      toState: BookingState;
      reason: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Update booking state
      const { data, error } = await supabase
        .from("bookings")
        .update({ state: toState })
        .eq("id", bookingId)
        .select()
        .single();
      if (error) throw error;

      // Write audit log
      await supabase.from("booking_state_log").insert({
        booking_id: bookingId,
        from_state: fromState,
        to_state: toState,
        changed_by: user?.id ?? null,
        reason,
      });

      // Attribution — a manual status change is an override of the automatic flow.
      await logOverrideEvent({
        actionType: "booking_state_override",
        targetType: "booking",
        targetId: bookingId,
        bookingId,
        roomId: (data as any)?.unit_id ?? null,
        beforeState: { state: fromState },
        afterState: { state: toState },
        reason,
      });


      // Fetch unit name for richer notifications
      let unitName = "";
      if (data.unit_id) {
        const { data: unit } = await supabase.from("units").select("name").eq("id", data.unit_id).single();
        unitName = unit?.name ?? "";
      }

      // Build contextual guest notification
      const batch: Array<{ user_id: string; type: string; reference_id: string; message: string }> = [];
      if (data.guest_id && data.guest_id !== user?.id) {
        let guestMsg: string;
        if (fromState === "inquiry" && toState === "soft_hold") {
          guestMsg = `Your inquiry${unitName ? ` for ${unitName}` : ""} has been acknowledged and placed on hold. We'll follow up shortly.`;
        } else if (fromState === "inquiry" && toState === "cancelled") {
          guestMsg = `Your inquiry${unitName ? ` for ${unitName}` : ""} could not be accommodated.${reason ? ` Reason: ${reason}` : ""}`;
        } else {
          guestMsg = `Your booking${unitName ? ` (${unitName})` : ""} status changed to ${toState}`;
        }
        batch.push({ user_id: data.guest_id, type: "booking", reference_id: bookingId, message: guestMsg });
      }
      const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "manager"]);
      for (const admin of admins ?? []) {
        if (admin.user_id !== user?.id) {
          batch.push({ user_id: admin.user_id, type: "booking", reference_id: bookingId, message: `Booking transitioned from ${fromState} to ${toState}` });
        }
      }
      await createNotifications(batch);

      // ── Outbound messaging bridge (fire-and-forget) ──
      try {
        const { notifyViaMessaging } = await import("@/lib/notifyMessaging");
        // Notify staff/managers of state change
        notifyViaMessaging({
          event_type: "booking_state_change",
          subject_id: bookingId,
          metadata: {
            from_state: fromState, to_state: toState, unit_name: unitName, reason,
          },
        });
        // Approval-needed alert for admins
        if (toState === "pending_approval") {
          notifyViaMessaging({
            event_type: "booking_approval_needed",
            subject_id: bookingId,
            metadata: { unit_name: unitName, check_in: data.check_in },
          });
        }
        // Booking approved (-> pending_deposit or confirmed from pending_approval)
        if (fromState === "pending_approval" && (toState === "pending_deposit" || toState === "confirmed")) {
          notifyViaMessaging({
            event_type: "booking_approved",
            subject_id: bookingId,
            metadata: { unit_name: unitName, check_in: data.check_in },
          });
        }
        // Guest-targeted: booking confirmed
        if (toState === "confirmed" && data.guest_id) {
          notifyViaMessaging({
            event_type: "booking_confirmed",
            subject_id: bookingId,
            guest_user_id: data.guest_id,
            metadata: { unit_name: unitName, check_in: data.check_in, check_out: data.check_out },
          });
        }
      } catch (err) {
        console.warn("messaging bridge dispatch failed:", err);
      }

      // ── Email notification triggers on state changes ──
      // Recipient, language and template data are resolved server-side so the
      // browser can never pick an arbitrary recipient or template.
      if (data.guest_id && ["confirmed", "checked_in", "completed"].includes(toState)) {
        supabase.functions
          .invoke("send-booking-state-email", {
            body: { booking_id: bookingId, state: toState },
          })
          .catch(console.error);
      }

      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking"] });
      qc.invalidateQueries({ queryKey: ["bookingStateLog"] });
    },
  });
}

// ── State log for a booking (with actor name) ──
export function useBookingStateLog(bookingId: string | null) {
  return useQuery({
    queryKey: ["bookingStateLog", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_state_log")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Resolve changed_by user names
      const userIds = [...new Set((data ?? []).map((l) => l.changed_by).filter(Boolean))] as string[];
      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown"]));
      }

      return (data ?? []).map((log) => ({
        ...log,
        changed_by_name: log.changed_by ? (profileMap.get(log.changed_by) ?? null) : null,
      }));
    },
  });
}

// ── Payments for a booking ──
export function useBookingPayments(bookingId: string | null) {
  return useQuery({
    queryKey: ["bookingPayments", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

/** Outstanding balance for a booking — derived from payments */
export function useOutstandingBalance(bookingId: string | null, totalPrice: number | null) {
  const { data: payments } = useBookingPayments(bookingId);
  return useMemo(() => {
    if (!payments) return { totalPaid: 0, totalRefunded: 0, addonTotal: 0, grandTotal: totalPrice ?? 0, outstanding: totalPrice ?? 0 };
    return calculateOutstanding(totalPrice, payments);
  }, [payments, totalPrice]);
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: {
      booking_id: string;
      amount: number;
      method: string;
      notes?: string;
      source_channel?: string;
      payment_type?: string;
      description?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { source_channel, payment_type, description } = payment;

      // Offline money goes through the recorder RPC — it derives the actor
      // server-side, enforces role + property scope, stamps the provider
      // fields so a hand-recorded row can never masquerade as Stripe, and
      // writes the audit receipt in the same transaction as the insert.
      try {
        assertRecordableOfflinePayment({
          amount: payment.amount,
          method: payment.method,
          source_channel,
        });
      } catch (guardError) {
        void reportOfflinePaymentRejection({
          bookingId: payment.booking_id,
          attemptedAmount: payment.amount,
          error: guardError,
          method: payment.method,
          sourceChannel: source_channel ?? "front_desk",
          origin: "client_guard",
        });
        throw guardError;
      }

      const { data: paymentId, error } = await supabase.rpc("record_offline_payment", {
        _booking_id: payment.booking_id,
        _amount: payment.amount,
        _method: payment.method,
        _payment_type: payment_type ?? "deposit",
        _notes: payment.notes ?? description ?? null,
        _source_channel: source_channel ?? "front_desk",
      } as any);
      if (error) {
        // Log the refusal in its own transaction — the rejected call rolled back.
        await reportOfflinePaymentRejection({
          bookingId: payment.booking_id,
          attemptedAmount: payment.amount,
          error,
          method: payment.method,
          sourceChannel: source_channel ?? "front_desk",
          origin: "server",
        });
        throw new Error(friendlyPaymentError(error));
      }


      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId as any)
        .maybeSingle();




      // If the booking is in pending_deposit, notify guest about deposit receipt
      const { data: booking } = await supabase
        .from("bookings")
        .select("state, guest_id")
        .eq("id", payment.booking_id)
        .single();

      // Fetch currency for notification formatting
      const { data: currencyPolicy } = await supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "currency_symbol")
        .maybeSingle();
      const currSym = currencyPolicy?.value ? String(currencyPolicy.value).replace(/^"|"$/g, "") : "฿";

      const batch: Array<{ user_id: string; type: string; reference_id: string; message: string }> = [];
      if (booking?.state === "pending_deposit" && booking.guest_id && booking.guest_id !== user?.id) {
        batch.push({ user_id: booking.guest_id, type: "booking", reference_id: payment.booking_id, message: `Your deposit of ${currSym}${payment.amount.toFixed(2)} (${payment.method}) has been received. Your booking will be confirmed shortly.` });
      }
      const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "manager"]);
      for (const admin of admins ?? []) {
        if (admin.user_id !== user?.id) {
          batch.push({ user_id: admin.user_id, type: "booking", reference_id: payment.booking_id, message: `Deposit of ${currSym}${payment.amount.toFixed(2)} recorded via ${payment.method}` });
        }
      }
      await createNotifications(batch);

      // Emit Fenrir security event for payment
      if (user) {
        const { data: userRoles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        const actorRole = userRoles?.[0]?.role ?? null;
        emitPaymentProcessed(
          { userId: user.id, email: user.email ?? undefined, role: actorRole },
          payment.amount,
          payment.method,
          payment.booking_id
        );
      }

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingPayments", vars.booking_id] });
    },
  });
}

// ── Refund a payment (calls Stripe FIRST via edge function, then DB) ──
export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      paymentId: string;
      bookingId: string;
      refundAmount: number;
      reason: string;
    }) => {
      // Server-side: validates admin, calls Stripe, mutates DB only on Stripe success.
      const { data, error } = await supabase.functions.invoke("refund-payment", {
        body: {
          payment_id: params.paymentId,
          refund_amount: params.refundAmount,
          reason: params.reason,
        },
      });
      if (error) throw error;
      if (data?.error) {
        const msg = data.provider_message
          ? `${data.error}: ${data.provider_message}`
          : data.error;
        throw new Error(msg);
      }

      // Stripe path: edge function already inserted admin notifications.
      // Manual path: insert client-side notifications so admins still see it.
      const { data: { user } } = await supabase.auth.getUser();
      if (data?.provider === "manual") {
        const { data: currencyPolicy } = await supabase
          .from("policy_settings")
          .select("value")
          .eq("key", "currency_symbol")
          .maybeSingle();
        const currSym = currencyPolicy?.value ? String(currencyPolicy.value).replace(/^"|"$/g, "") : "฿";

        const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "manager"]);
        const batch: Array<{ user_id: string; type: string; reference_id: string; message: string }> = [];
        for (const admin of admins ?? []) {
          if (admin.user_id !== user?.id) {
            batch.push({
              user_id: admin.user_id,
              type: "booking",
              reference_id: params.bookingId,
              message: `Manual refund of ${currSym}${params.refundAmount.toFixed(2)} recorded: ${params.reason}`,
            });
          }
        }
        await createNotifications(batch);
      }

      // Emit Fenrir security event for refund
      if (user) {
        const { data: userRoles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        const actorRole = userRoles?.[0]?.role ?? null;
        emitRefundIssued(
          { userId: user.id, email: user.email ?? undefined, role: actorRole },
          params.refundAmount,
          params.reason,
          params.bookingId
        );
      }

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingPayments", vars.bookingId] });
    },
  });
}

// ── Messages for a booking ──
export function useBookingMessages(bookingId: string | null) {
  return useQuery({
    queryKey: ["bookingMessages", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
  });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: {
      booking_id: string;
      content: string;
      is_internal: boolean;
      attachment_url?: string | null;
      attachment_type?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Check if this is a guest-facing message from non-admin — save as draft
      let isDraft = false;
      if (!message.is_internal) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user?.id ?? "");
        const userRole = roles?.[0]?.role;
        if (userRole && userRole !== "admin") {
          isDraft = true;
        }
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({
          booking_id: message.booking_id,
          content: message.content,
          is_internal: message.is_internal,
          sender_id: user?.id ?? null,
          draft: isDraft,
          ...(message.attachment_url ? { attachment_url: message.attachment_url, attachment_type: message.attachment_type } : {}),
        } as any)
        .select()
        .single();
      if (error) throw error;

      // If draft, notify admins for review
      if (isDraft) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user?.id ?? "")
          .single();
        const senderName = profile?.full_name ?? "Staff";
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        await createNotifications(
          (admins ?? [])
            .filter((a) => a.user_id !== user?.id)
            .map((a) => ({
              user_id: a.user_id,
              type: "message",
              reference_id: message.booking_id,
              message: `${senderName} drafted a guest message pending your approval`,
            }))
        );
      }

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingMessages", vars.booking_id] });
    },
  });
}

// ── Approve / reject draft messages (Admin only) ──
export function useApproveDraftMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, bookingId, approve }: { messageId: string; bookingId: string; approve: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (approve) {
        const { error } = await supabase
          .from("messages")
          .update({ draft: false, approved_by: user?.id } as any)
          .eq("id", messageId);
        if (error) throw error;
      } else {
        // Reject — delete the draft
        const { error } = await supabase
          .from("messages")
          .delete()
          .eq("id", messageId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingMessages", vars.bookingId] });
      qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      qc.invalidateQueries({ queryKey: ["draft-messages"] });
    },
  });
}

// ── Pending draft messages (Admin dashboard) ──
export function useDraftMessages() {
  return useQuery({
    queryKey: ["draft-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("draft", true)
        .eq("is_internal", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Message[];
    },
  });
}

// ── Mark messages as read ──
export function useMarkMessagesRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() } as any)
        .eq("booking_id", bookingId)
        .is("read_at", null)
        .or(`sender_id.neq.${user.id},sender_id.is.null`);
      if (error) throw error;
    },
    onSuccess: (_, bookingId) => {
      qc.invalidateQueries({ queryKey: ["bookingMessages", bookingId] });
      qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      qc.invalidateQueries({ queryKey: ["guest-messages"] });
    },
  });
}
