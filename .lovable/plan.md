
# Contextual Actor Identity — Real Names Instead of Generic Labels

## Problem

Right now, every AI actor message, typing indicator, activity log entry, and chaos event uses generic labels like "Guest AI" or "Supervisor AI". When you're managing 12 bookings with different guests (Alex Turner, Maria Santos, Walk-in Guest, etc.), seeing "Guest AI" in the messages panel tells you nothing. You need to know *which* guest is talking.

## What Changes

Every place that currently says "Guest AI" will instead show the actual guest name from the booking context. Supervisor and Maintenance actors will also include the booking context so you know who they're talking about.

### Identity Mapping

| Actor | Current Label | New Label |
|-------|--------------|-----------|
| Guest | "Guest AI" | "Alex Turner" (with AI badge) |
| Supervisor | "Supervisor AI" | "Supervisor — re: Alex Turner" |
| Maintenance | "Maintenance AI" | "Maintenance — re: Alex Turner" |
| Front Desk | "Front Desk AI" | "Front Desk — re: Alex Turner" |
| Typing indicator | "guest AI" | "Alex Turner is typing..." |
| Activity log | "Guest AI" | "Alex Turner" |
| Chaos events | "Chaos: Confused guest message" | "Chaos: Walk-in Guest sent confused message" |

---

## Files Changed

### 1. `SimulationContext.tsx` — Extend typing state with guest name

Add `guestName` to the `actorTyping` state so the typing indicator can show the real name.

- Change `actorTyping` type from `{ actor: string; bookingId: string }` to `{ actor: string; bookingId: string; guestName: string }`

### 2. `useSimulationActors.ts` — Thread guest name through all actor events

- When setting `actorTyping`, include `guestName` from the matched booking
- When logging to `addActorLog`, include guest name in the action string (e.g., "Alex Turner" instead of generic actor label)
- In chaos events, use the actual `randomBooking.guest_name` in log messages and confused message content
- Add a `guest_name` field to the edge function payload so the AI model knows the guest's name and can reference it naturally in responses

### 3. `SimulationSandbox.tsx` — Messages panel shows real names

In the `MessagesPanel` component:
- When rendering AI actor messages: if the actor is "guest", show `booking.guest_name` instead of "Guest AI". For other actors (supervisor, maintenance, front_desk), show the role label followed by the guest context (e.g., "Supervisor — re: Alex Turner")
- For the typing indicator: show `actorTyping.guestName` instead of the generic actor label. For non-guest actors, show "Supervisor — re: {name}"
- Update the message alignment logic to keep guest-actor messages on the left and staff-actor messages on the right

### 4. `AIActorEngine.tsx` — Activity log shows guest names

- Update the activity log rendering to parse guest names from the action strings (already included from step 2)
- No structural changes needed since the log entries already contain the action text with context — the improvement comes from the data being richer

### 5. `ai-assistant/index.ts` — AI knows the guest's name

- In the `simulation_actor` branch, include `guest_name` from the context payload in the system prompt so the AI model addresses the guest by name when acting as them, and references them by name when acting as supervisor/maintenance

---

## Technical Notes

- No database changes
- No new state — just enriching existing state with the guest name from the booking that's already available in context
- The `actorTyping` type change is backwards-compatible since it only adds a field
- Guest names for chaos events come from the randomly selected booking, so they're always contextually correct
- When a booking has no guest name (edge case), falls back to "Guest" as before
