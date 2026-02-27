import { useEffect, useRef, useCallback } from "react";
import { useSimulation } from "./SimulationContext";
import { useAuth } from "@/hooks/useAuth";
import type { SimulationData } from "./mockData";

type ActorRole = "guest" | "supervisor" | "maintenance" | "front_desk";

interface ActorEvent {
  actor: ActorRole;
  event_type: string;
  context_summary: string;
  booking_id?: string;
}

const COOLDOWN_MS = 5000;

function detectChanges(
  prev: SimulationData | null,
  next: SimulationData,
  simulatedRole: string
): ActorEvent | null {
  if (!prev) return null;

  // Booking state transitions
  for (const nb of next.bookings) {
    const pb = prev.bookings.find((b) => b.id === nb.id);
    if (pb && pb.state !== nb.state) {
      // If user is acting as staff, supervisor or admin — guest or supervisor responds
      const actor: ActorRole =
        nb.state === "pending_approval" || nb.state === "confirmed"
          ? "supervisor"
          : "guest";
      return {
        actor,
        event_type: `booking_transition:${pb.state}->${nb.state}`,
        context_summary: `Booking for ${nb.guest_name} in unit ${nb.unit_id} transitioned from "${pb.state}" to "${nb.state}".`,
        booking_id: nb.id,
      };
    }
  }

  // New bookings
  if (next.bookings.length > prev.bookings.length) {
    const newBooking = next.bookings.find(
      (nb) => !prev.bookings.some((pb) => pb.id === nb.id)
    );
    if (newBooking) {
      return {
        actor: "guest",
        event_type: "booking_created",
        context_summary: `New booking created for ${newBooking.guest_name}, unit ${newBooking.unit_id}, ${newBooking.check_in} to ${newBooking.check_out}.`,
        booking_id: newBooking.id,
      };
    }
  }

  // New messages (only respond to staff messages)
  if (next.messages.length > prev.messages.length) {
    const newMsgs = next.messages.filter(
      (nm) => !prev.messages.some((pm) => pm.id === nm.id)
    );
    const staffMsg = newMsgs.find(
      (m) => m.sender_id && !m.sender_id.includes("guest") && !m.sender_id.includes("ai-actor")
    );
    if (staffMsg) {
      if (staffMsg.is_internal) {
        return {
          actor: "supervisor",
          event_type: "internal_note_sent",
          context_summary: `Staff posted internal note: "${staffMsg.content}"`,
          booking_id: staffMsg.booking_id,
        };
      }
      return {
        actor: "guest",
        event_type: "staff_message_sent",
        context_summary: `Staff sent message to guest: "${staffMsg.content}"`,
        booking_id: staffMsg.booking_id,
      };
    }
  }

  // Maintenance status changes
  for (const nr of next.maintenanceRequests) {
    const pr = prev.maintenanceRequests.find((r) => r.id === nr.id);
    if (pr && pr.status !== nr.status) {
      const actor: ActorRole = nr.status === "resolved" ? "guest" : "maintenance";
      return {
        actor,
        event_type: `maintenance_status:${pr.status}->${nr.status}`,
        context_summary: `Maintenance request "${nr.description}" changed from "${pr.status}" to "${nr.status}".`,
        booking_id: nr.booking_id,
      };
    }
  }

  // Laundry status changes
  for (const nr of next.laundryRequests) {
    const pr = prev.laundryRequests.find((r) => r.id === nr.id);
    if (pr && pr.status !== nr.status) {
      return {
        actor: "guest",
        event_type: `laundry_status:${pr.status}->${nr.status}`,
        context_summary: `Laundry request (${nr.bag_count} bags) changed from "${pr.status}" to "${nr.status}".`,
        booking_id: nr.booking_id,
      };
    }
  }

  return null;
}

export function useSimulationActors(enabled: boolean) {
  const { data, sendMessage, addActorLog, simulatedRole } = useSimulation();
  const { session } = useAuth();
  const prevDataRef = useRef<SimulationData | null>(null);
  const lastCallRef = useRef<number>(0);
  const pendingRef = useRef(false);

  const callActor = useCallback(
    async (event: ActorEvent) => {
      if (!session || pendingRef.current) return;

      const now = Date.now();
      if (now - lastCallRef.current < COOLDOWN_MS) return;

      pendingRef.current = true;
      lastCallRef.current = now;

      try {
        const booking = data.bookings.find((b) => b.id === event.booking_id);

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              mode: "simulation_actor",
              role: event.actor,
              messages: [{ role: "user", content: event.context_summary }],
              context: {
                actor: event.actor,
                event_type: event.event_type,
                sandbox_state: {
                  booking: booking
                    ? { guest_name: booking.guest_name, state: booking.state, unit_id: booking.unit_id, check_in: booking.check_in, check_out: booking.check_out }
                    : null,
                  units: data.units.map((u) => ({ name: u.name, id: u.id })),
                  recent_messages: data.messages
                    .filter((m) => m.booking_id === event.booking_id)
                    .slice(-5)
                    .map((m) => ({ sender: m.sender_id, content: m.content, internal: m.is_internal })),
                },
              },
            }),
          }
        );

        if (!resp.ok) return;

        const result = await resp.json();
        const content = result.content;
        if (!content) return;

        // Inject AI response as a message after a brief delay
        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

        const senderMap: Record<string, string> = {
          guest: `ai-actor-guest`,
          supervisor: `ai-actor-supervisor`,
          maintenance: `ai-actor-maintenance`,
          front_desk: `ai-actor-front-desk`,
        };

        sendMessage({
          booking_id: event.booking_id || data.bookings[0]?.id || "",
          sender_id: senderMap[event.actor] || "ai-actor-guest",
          content,
          is_internal: event.actor === "supervisor",
        });

        addActorLog({
          actor: event.actor,
          action: `${event.event_type}: "${content.slice(0, 60)}${content.length > 60 ? "…" : ""}"`,
        });
      } catch {
        // Silently skip on error
      } finally {
        pendingRef.current = false;
      }
    },
    [session, data, sendMessage, addActorLog]
  );

  useEffect(() => {
    if (!enabled) {
      prevDataRef.current = data;
      return;
    }

    const event = detectChanges(prevDataRef.current, data, simulatedRole);
    prevDataRef.current = data;

    if (event) {
      callActor(event);
    }
  }, [data, enabled, simulatedRole, callActor]);

  // Initialize prev ref on mount
  useEffect(() => {
    prevDataRef.current = data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
