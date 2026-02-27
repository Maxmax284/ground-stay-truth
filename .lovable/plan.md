

# AI Actors for the War Room Sandbox

## What This Adds

Right now, the sandbox is a solo experience -- you click buttons and things happen, but there's no one "on the other side." This enhancement adds **AI-powered role actors** that simulate real people responding to your actions in real time, making the training feel like a live multi-user environment.

## How It Works

When you're in the Sandbox tab, you'll see a new **"AI Actors" toggle panel** at the top. Turn it on, and the system will automatically generate contextual responses based on what you do:

- **You create a booking as Front Desk** -- the AI Guest actor replies with a message like "Thanks! Can I get a room with ring view?"
- **You transition a booking to confirmed** -- the AI Supervisor actor posts an internal note: "Deposit verified. Good to go."
- **You advance a maintenance request** -- the AI Guest actor sends a follow-up: "Is the shower fixed yet?"
- **You send a message as Staff** -- the AI Guest actor responds naturally based on the conversation context

### Actor Profiles

Each actor has a distinct personality aligned with the platform's role system:

| Actor | Triggers On | Behavior |
|-------|------------|----------|
| Guest | Booking transitions, staff messages, service updates | Asks questions, confirms details, reports issues, requests services |
| Supervisor | Booking approvals, escalations, state changes | Posts internal notes with operational guidance, flags concerns |
| Maintenance | Maintenance status changes | Updates on repair progress, requests parts, reports completion |
| Front Desk | New inquiries, guest messages | Responds to guest questions, coordinates logistics |

### What You See

1. A collapsible **"AI Actors" panel** in the Sandbox with on/off toggle and activity log
2. When active, AI responses appear in the Messages panel with a small robot icon badge so you can distinguish them from your manual entries
3. A brief typing delay (1-2 seconds) to simulate realistic response timing
4. Each AI message shows which actor generated it (e.g., "Guest AI" or "Supervisor AI")

### Intelligence Source

The AI actors use the existing **Kru Glitch AI backend** (`ai-assistant` edge function) with a new `simulation_actor` mode. The edge function already has role-scoped system prompts -- the actors leverage this by calling the AI with the appropriate role context and the current sandbox state as context. This means the actors speak with the same personality and role awareness as the real Kru Glitch assistant.

## Technical Approach

### New Files

1. **`src/components/simulation/AIActorEngine.tsx`** -- The actor engine component that watches SimulationContext for changes and triggers AI responses. Contains:
   - Change detection hooks that fire when bookings transition, messages are sent, or service requests update
   - Actor selection logic (which actor should respond to which event)
   - Response rendering with typing indicator and actor attribution
   - On/off toggle with activity feed

2. **`src/components/simulation/useSimulationActors.ts`** -- Custom hook that:
   - Listens to `data` changes in SimulationContext via `useEffect` with previous-state comparison
   - Determines the appropriate actor role based on the change type
   - Calls the `ai-assistant` edge function with `mode: "simulation_actor"` and sandbox context
   - Injects the AI response back into SimulationContext (as a message, internal note, or status update)
   - Manages a queue to prevent overlapping AI calls
   - Includes a cooldown to avoid rapid-fire responses

### Modified Files

1. **`supabase/functions/ai-assistant/index.ts`** -- Add a `simulation_actor` mode branch that:
   - Skips the real database context-fetching (no production queries)
   - Accepts sandbox state as the context payload directly from the client
   - Uses a shorter, actor-specific system prompt (e.g., "You are a guest at a Muay Thai fight camp. Respond naturally to this situation...")
   - Returns a concise 1-3 sentence response (not a full advisory answer)

2. **`src/components/simulation/SimulationSandbox.tsx`** -- Import and render the `AIActorEngine` component at the top of the sandbox layout

3. **`src/components/simulation/SimulationContext.tsx`** -- Add a small `actorLog` array to track AI actor activity (actor name, action, timestamp) for the activity feed display

### No Database Changes

All AI actor state lives in the existing SimulationContext (in-memory). The only backend call is to the existing `ai-assistant` edge function with a new mode parameter.

## Implementation Sequence

1. Add `simulation_actor` mode to the `ai-assistant` edge function with actor-specific prompts
2. Create `useSimulationActors` hook with change detection and AI call logic
3. Build `AIActorEngine` UI component with toggle, activity log, and typing indicators
4. Wire into `SimulationSandbox` and extend `SimulationContext` with actor log state
5. Add actor badge styling to the Messages panel to distinguish AI-generated messages

## Safeguards

- AI actors are **off by default** -- users opt in via toggle
- Rate limiting: maximum 1 AI call per 5 seconds to avoid hammering the backend
- Responses are capped at 150 tokens to keep them short and realistic
- If the AI call fails (rate limit, network), the actor silently skips -- no error disrupts the sandbox
- Actor messages are visually distinct (robot icon + "AI Actor" label) so users never confuse them with real data

