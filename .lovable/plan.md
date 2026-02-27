

# War Room AI Actors — Advanced Intelligence Layer

This is a significant enhancement to the AI Actor system across 10 capabilities, organized into 5 implementation tasks.

## Overview

The current AI Actors system detects sandbox changes, calls the edge function, and injects a response. This upgrade adds session memory, chaos injection, actor priority/difficulty controls, safety hardening, and a post-session debrief — all client-side except for the existing edge function call which gets an expanded prompt payload.

---

## Task 1: Actor Session Memory + Memory Indicator

**What it does:** Each actor (guest, supervisor, maintenance, front_desk) accumulates a per-session memory buffer of key events, emotional tone, and unresolved items. This buffer is sent as context with every AI call so actors can reference prior interactions ("You mentioned the shower earlier — is it fixed?"). A "Simulation Memory Active" badge appears in the AI Actors panel when memory is influencing responses.

**Files changed:**
- `SimulationContext.tsx` — Add `actorMemory: Record<string, ActorMemoryEntry[]>` state and `addActorMemory` / `clearActorMemory` callbacks. Each entry stores: actor, event summary, emotional tone tag (neutral/frustrated/grateful/urgent), unresolved flag, timestamp. Capped at 20 entries per actor.
- `useSimulationActors.ts` — After each AI response, push a memory entry. Before calling the edge function, include the actor's memory buffer (last 10 entries) in the `context.actor_memory` payload.
- `AIActorEngine.tsx` — Show a small "Memory Active" indicator (brain icon + badge) when any actor has 1+ memory entries. Add a "Clear Memory" button.
- `ai-assistant/index.ts` — In the `simulation_actor` branch, append `actor_memory` to the system prompt so the model can reference prior events.

---

## Task 2: Actor Priority Hierarchy + Per-Actor Cooldown + Event Queue Lock

**What it does:** When a single sandbox event could trigger multiple actors, a priority system ensures only one responds. Priority order: Maintenance (on repair events) > Supervisor (on escalations/approvals) > Front Desk (on inquiries) > Guest (default). A global event queue lock prevents overlapping calls, and each actor gets an independent cooldown (configurable, default 5s) to prevent ping-pong loops.

**Files changed:**
- `useSimulationActors.ts` — Replace `detectChanges` returning a single event with `detectAllChanges` returning an array. Add `ACTOR_PRIORITY` map and select the highest-priority actor from the candidates. Add per-actor cooldown tracking via a `Record<string, number>` ref. Add a queue lock ref that blocks new calls while one is in flight. Log which actors were suppressed in the actor log for transparency.
- `SimulationContext.tsx` — Extend `ActorLogEntry` with an optional `type` field: `"response"` | `"escalation"` | `"suppressed"`. This enables the debrief to filter escalation events separately.

---

## Task 3: Actor Difficulty Setting (Calm / Neutral / Demanding / Chaos)

**What it does:** A 4-level difficulty selector in the AI Actors panel that modifies the tone and behavior instructions sent to the AI without changing sandbox logic. Each level adjusts: emotional intensity, follow-up frequency, and likelihood of complications.

| Level | Guest Tone | Supervisor Tone | Extras |
|-------|-----------|----------------|--------|
| Calm | Polite, patient, grateful | Approving, minimal notes | No follow-ups |
| Neutral | Normal, occasional questions | Standard operational notes | Rare follow-ups |
| Demanding | Impatient, detailed complaints | Critical, flags concerns | Frequent follow-ups |
| Chaos | Angry, contradictory, urgent | Escalation-heavy, deadline pressure | Rapid follow-ups + chaos events |

**Files changed:**
- `SimulationContext.tsx` — Add `actorDifficulty` state (`"calm" | "neutral" | "demanding" | "chaos"`) and setter. Default: `"neutral"`.
- `AIActorEngine.tsx` — Add a segmented button group (Calm / Neutral / Demanding / Chaos) below the toggle. Visual styling changes per level (green/gray/orange/red accent).
- `useSimulationActors.ts` — Include `difficulty` in the edge function payload. Reduce cooldown at higher difficulty levels (calm=8s, neutral=5s, demanding=3s, chaos=2s).
- `ai-assistant/index.ts` — In `simulation_actor` mode, append difficulty-specific tone instructions to the system prompt. At "chaos" level, add instructions for the actor to occasionally introduce complications (wrong room number, urgency spikes, misunderstandings).

---

## Task 4: Chaos Mode Engine

**What it does:** When difficulty is set to "Chaos," a client-side chaos engine injects controlled random events into the sandbox on a timer: duplicate service requests, urgency spikes on existing bookings, miscommunication messages, and delayed follow-ups. This simulates a high-pressure operational day.

**Files changed:**
- `useSimulationActors.ts` — Add a `useEffect` that runs an interval (every 15-30s, randomized) when difficulty is `"chaos"` and actors are enabled. Each tick randomly selects from a pool of chaos actions:
  - Inject a duplicate laundry request for a random active booking
  - Create a new maintenance request with "urgent" priority
  - Send a confused guest message to the wrong booking thread
  - Transition a random booking backward (e.g., confirmed back to pending_deposit with a note "Payment reversed")
  - Add an actor log entry tagged as `type: "chaos"` so it's visible in the activity feed
- Chaos events are rate-limited to max 1 per interval and stop when actors are toggled off.

---

## Task 5: War Room Debrief + Production Isolation Hardening

**What it does:** A "Session Debrief" button appears in the AI Actors panel after 5+ actor interactions. Clicking it generates a summary of the session: total events handled, average response time (simulated), escalations triggered, chaos events survived, and decision points where the user delayed action. Also hardens the simulation_actor mode to guarantee zero production data leakage.

**Files changed:**
- `AIActorEngine.tsx` — Add a "Session Debrief" button (visible when actorLog has 5+ entries). On click, opens a dialog showing:
  - Total actor responses by role
  - Escalation events (filtered by `type: "escalation"`)
  - Chaos events survived (filtered by `type: "chaos"`)
  - Suppressed actors (filtered by `type: "suppressed"`)
  - Bookings created and transitioned during session
  - A "Resolution Efficiency" score: (resolved maintenance + delivered laundry) / total service requests as a percentage
  - Messages exchanged count
  - All computed client-side from SimulationContext data — no AI call needed
- `ai-assistant/index.ts` — Add an explicit guard at the top of the `simulation_actor` branch: skip all database client creation, skip all `adminClient` queries, and return early if any `context` field references real table IDs (not prefixed with `sim-`). Add a comment block documenting the isolation contract. Cap `max_tokens` to 100 and add a `stop` sequence to enforce 1-3 sentence responses while allowing minor imperfections via the prompt ("You may occasionally misremember a detail or ask a clarifying follow-up — this is natural").

---

## Technical Notes

- **No database changes.** Everything lives in SimulationContext state (resets on refresh).
- **No new edge functions.** All changes go through the existing `ai-assistant` function's `simulation_actor` branch.
- **Response realism:** The prompt update explicitly instructs actors to include minor imperfections — light misunderstandings, follow-up clarifications, emotional variation — while staying within 1-3 sentences.
- **Actor log types** (`response`, `escalation`, `chaos`, `suppressed`) enable the debrief to slice data without additional state.

## Implementation Order

1. Task 2 first (priority + cooldown) — foundational plumbing
2. Task 1 (memory) — builds on the event flow
3. Task 3 (difficulty) — extends context payload
4. Task 4 (chaos) — depends on difficulty setting
5. Task 5 (debrief + isolation) — wraps everything up

