import { useEffect, useRef, useCallback } from "react";
import { useSimulation, type ActorDifficulty } from "./SimulationContext";
import { useAuth } from "@/hooks/useAuth";
import type { SimulationData } from "./mockData";

type ActorRole = "guest" | "supervisor" | "maintenance" | "front_desk";

interface ActorEvent {
  actor: ActorRole;
  event_type: string;
  context_summary: string;
  booking_id?: string;
}

// Priority: higher number = higher priority for a given event category
const ACTOR_PRIORITY: Record<ActorRole, number> = {
  maintenance: 4,
  supervisor: 3,
  front_desk: 2,
  guest: 1,
};

const COOLDOWN_BY_DIFFICULTY: Record<ActorDifficulty, number> = {
  calm: 8000,
  neutral: 5000,
  demanding: 3000,
  chaos: 2000,
};

function detectAllChanges(
  prev: SimulationData | null,
  next: SimulationData,
  _simulatedRole: string
): ActorEvent[] {
  if (!prev) return [];
  const events: ActorEvent[] = [];

  // Booking state transitions
  for (const nb of next.bookings) {
    const pb = prev.bookings.find((b) => b.id === nb.id);
    if (pb && pb.state !== nb.state) {
      // Supervisor responds on approvals/escalations
      if (nb.state === "pending_approval" || nb.state === "confirmed" || nb.state === "pending_deposit") {
        events.push({
          actor: "supervisor",
          event_type: `booking_transition:${pb.state}->${nb.state}`,
          context_summary: `Booking for ${nb.guest_name} in unit ${nb.unit_id} transitioned from "${pb.state}" to "${nb.state}".`,
          booking_id: nb.id,
        });
      }
      // Guest responds to most transitions
      events.push({
        actor: "guest",
        event_type: `booking_transition:${pb.state}->${nb.state}`,
        context_summary: `Booking for ${nb.guest_name} in unit ${nb.unit_id} transitioned from "${pb.state}" to "${nb.state}".`,
        booking_id: nb.id,
      });
    }
  }

  // New bookings
  if (next.bookings.length > prev.bookings.length) {
    const newBooking = next.bookings.find(
      (nb) => !prev.bookings.some((pb) => pb.id === nb.id)
    );
    if (newBooking) {
      events.push({
        actor: "guest",
        event_type: "booking_created",
        context_summary: `New booking created for ${newBooking.guest_name}, unit ${newBooking.unit_id}, ${newBooking.check_in} to ${newBooking.check_out}.`,
        booking_id: newBooking.id,
      });
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
        events.push({
          actor: "supervisor",
          event_type: "internal_note_sent",
          context_summary: `Staff posted internal note: "${staffMsg.content}"`,
          booking_id: staffMsg.booking_id,
        });
      } else {
        events.push({
          actor: "guest",
          event_type: "staff_message_sent",
          context_summary: `Staff sent message to guest: "${staffMsg.content}"`,
          booking_id: staffMsg.booking_id,
        });
      }
    }
  }

  // Maintenance status changes
  for (const nr of next.maintenanceRequests) {
    const pr = prev.maintenanceRequests.find((r) => r.id === nr.id);
    if (pr && pr.status !== nr.status) {
      if (nr.status === "resolved") {
        events.push({
          actor: "guest",
          event_type: `maintenance_status:${pr.status}->${nr.status}`,
          context_summary: `Maintenance request "${nr.description}" changed from "${pr.status}" to "${nr.status}".`,
          booking_id: nr.booking_id,
        });
      } else {
        events.push({
          actor: "maintenance",
          event_type: `maintenance_status:${pr.status}->${nr.status}`,
          context_summary: `Maintenance request "${nr.description}" changed from "${pr.status}" to "${nr.status}".`,
          booking_id: nr.booking_id,
        });
      }
    }
  }

  // Laundry status changes
  for (const nr of next.laundryRequests) {
    const pr = prev.laundryRequests.find((r) => r.id === nr.id);
    if (pr && pr.status !== nr.status) {
      events.push({
        actor: "guest",
        event_type: `laundry_status:${pr.status}->${nr.status}`,
        context_summary: `Laundry request (${nr.bag_count} bags) changed from "${pr.status}" to "${nr.status}".`,
        booking_id: nr.booking_id,
      });
    }
  }

  return events;
}

/** Select highest-priority actor from candidates */
function selectPriorityActor(events: ActorEvent[]): { selected: ActorEvent; suppressed: ActorEvent[] } | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => (ACTOR_PRIORITY[b.actor] || 0) - (ACTOR_PRIORITY[a.actor] || 0));
  return {
    selected: sorted[0],
    suppressed: sorted.slice(1),
  };
}

const CHAOS_ACTIONS = [
  "duplicate_laundry",
  "urgent_maintenance",
  "confused_message",
  "payment_reversal",
] as const;

export function useSimulationActors(enabled: boolean) {
  const {
    data, sendMessage, addActorLog, simulatedRole,
    actorMemory, addActorMemory, actorDifficulty,
    addMaintenanceRequest, addLaundryRequest, transitionBooking,
    setActorTyping,
  } = useSimulation();
  const { session } = useAuth();
  const prevDataRef = useRef<SimulationData | null>(null);
  const perActorCooldownRef = useRef<Record<string, number>>({});
  const queueLockRef = useRef(false);

  const callActor = useCallback(
    async (event: ActorEvent, suppressed: ActorEvent[]) => {
      if (!session || queueLockRef.current) return;

      const now = Date.now();
      const cooldownMs = COOLDOWN_BY_DIFFICULTY[actorDifficulty];
      const lastCall = perActorCooldownRef.current[event.actor] || 0;
      if (now - lastCall < cooldownMs) return;

      queueLockRef.current = true;
      perActorCooldownRef.current[event.actor] = now;

      // Log suppressed actors
      for (const s of suppressed) {
        addActorLog({
          actor: s.actor,
          action: `Suppressed by ${event.actor} (priority): ${s.event_type}`,
          type: "suppressed",
        });
      }
      // Set typing indicator
      setActorTyping({ actor: event.actor, bookingId: event.booking_id || "" });

      try {
        const booking = data.bookings.find((b) => b.id === event.booking_id);
        const memory = (actorMemory[event.actor] || []).slice(-10);

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
                difficulty: actorDifficulty,
                actor_memory: memory,
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

        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

        const senderMap: Record<string, string> = {
          guest: "ai-actor-guest",
          supervisor: "ai-actor-supervisor",
          maintenance: "ai-actor-maintenance",
          front_desk: "ai-actor-front-desk",
        };

        sendMessage({
          booking_id: event.booking_id || data.bookings[0]?.id || "",
          sender_id: senderMap[event.actor] || "ai-actor-guest",
          content,
          is_internal: event.actor === "supervisor",
        });

        // Determine log type
        const isEscalation = event.event_type.includes("approval") || event.event_type.includes("escalat");
        const logType = isEscalation ? "escalation" as const : "response" as const;

        addActorLog({
          actor: event.actor,
          action: `${event.event_type}: "${content.slice(0, 60)}${content.length > 60 ? "…" : ""}"`,
          type: logType,
        });

        // Add to actor memory
        const toneMap: Record<string, "neutral" | "frustrated" | "grateful" | "urgent"> = {
          calm: "grateful",
          neutral: "neutral",
          demanding: "frustrated",
          chaos: "urgent",
        };
        addActorMemory({
          actor: event.actor,
          summary: `${event.event_type}: ${content.slice(0, 100)}`,
          tone: toneMap[actorDifficulty] || "neutral",
          unresolved: event.event_type.includes("maintenance") && !event.event_type.includes("resolved"),
        });
      } catch {
        // Silently skip
      } finally {
        setActorTyping(null);
        queueLockRef.current = false;
      }
    },
    [session, data, sendMessage, addActorLog, actorMemory, addActorMemory, actorDifficulty]
  );

  // Main change detection effect
  useEffect(() => {
    if (!enabled) {
      prevDataRef.current = data;
      return;
    }

    const events = detectAllChanges(prevDataRef.current, data, simulatedRole);
    prevDataRef.current = data;

    const result = selectPriorityActor(events);
    if (result) {
      callActor(result.selected, result.suppressed);
    }
  }, [data, enabled, simulatedRole, callActor]);

  // Chaos engine: inject random events when difficulty = chaos
  useEffect(() => {
    if (!enabled || actorDifficulty !== "chaos") return;

    const interval = setInterval(() => {
      const activeBookings = data.bookings.filter(
        (b) => !["completed", "cancelled", "no_show"].includes(b.state)
      );
      if (activeBookings.length === 0) return;

      const action = CHAOS_ACTIONS[Math.floor(Math.random() * CHAOS_ACTIONS.length)];
      const randomBooking = activeBookings[Math.floor(Math.random() * activeBookings.length)];

      switch (action) {
        case "duplicate_laundry":
          addLaundryRequest({
            booking_id: randomBooking.id,
            unit_id: randomBooking.unit_id,
            bag_count: Math.ceil(Math.random() * 3),
            note: "Urgent — duplicate request from confused guest",
            status: "pending",
          });
          addActorLog({ actor: "guest", action: "Chaos: Duplicate laundry request submitted", type: "chaos" });
          break;

        case "urgent_maintenance":
          addMaintenanceRequest({
            booking_id: randomBooking.id,
            unit_id: randomBooking.unit_id,
            description: ["AC not cooling", "Water leak under sink", "Power outlet sparking", "Window won't lock"][Math.floor(Math.random() * 4)],
            category: "plumbing",
            priority: "urgent",
            status: "open",
          });
          addActorLog({ actor: "maintenance", action: "Chaos: Urgent maintenance request created", type: "chaos" });
          break;

        case "confused_message": {
          const wrongBooking = activeBookings[Math.floor(Math.random() * activeBookings.length)];
          sendMessage({
            booking_id: wrongBooking.id,
            sender_id: "ai-actor-guest",
            content: "Wait, I think I'm in the wrong room? The key doesn't work. Can someone help?",
            is_internal: false,
          });
          addActorLog({ actor: "guest", action: "Chaos: Confused guest message sent to wrong thread", type: "chaos" });
          break;
        }

        case "payment_reversal":
          if (randomBooking.state === "confirmed") {
            transitionBooking(randomBooking.id, "pending_deposit");
            addActorLog({ actor: "supervisor", action: `Chaos: Payment reversed for ${randomBooking.guest_name}`, type: "chaos" });
          }
          break;
      }
    }, 15000 + Math.random() * 15000);

    return () => clearInterval(interval);
  }, [enabled, actorDifficulty, data.bookings, addLaundryRequest, addMaintenanceRequest, sendMessage, addActorLog, transitionBooking]);

  // Initialize prev ref on mount
  useEffect(() => {
    prevDataRef.current = data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
