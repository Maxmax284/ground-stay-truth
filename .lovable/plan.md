

# Typing Indicator for AI Actor Responses

## What This Adds

A pulsing dots animation ("...") that appears in the Messages panel while an AI actor is generating a response. This gives users immediate visual feedback that an actor is "thinking" before its message appears, making the simulation feel more realistic and interactive.

## Current Gap

Right now, when you trigger an action (e.g., transition a booking), there's a 1-2 second delay before the AI response appears in the Messages panel, but nothing visible indicates that a response is coming. Users may think nothing happened.

## Implementation

### 1. Add typing state to SimulationContext

Add an `actorTyping` state (`{ actor: string; bookingId: string } | null`) to `SimulationContext.tsx` with a `setActorTyping` setter. This tracks which actor is currently generating a response and for which booking thread.

**File:** `src/components/simulation/SimulationContext.tsx`
- Add `actorTyping` state (default `null`) and `setActorTyping` callback
- Expose both in the context value

### 2. Set typing state in useSimulationActors

In `useSimulationActors.ts`, set `actorTyping` to the active actor before calling the edge function, and clear it after the response is injected (or on error).

**File:** `src/components/simulation/useSimulationActors.ts`
- Call `setActorTyping({ actor: event.actor, bookingId: event.booking_id })` before the fetch call
- Call `setActorTyping(null)` in the `finally` block (after the message is sent)

### 3. Render typing indicator in MessagesPanel

In `SimulationSandbox.tsx`, inside the `MessagesPanel` component, check `actorTyping` from context. When it matches the currently selected booking thread, render a small animated indicator at the bottom of the message list.

**File:** `src/components/simulation/SimulationSandbox.tsx`
- Import `actorTyping` from `useSimulation()`
- After the message list map, conditionally render a typing bubble with 3 pulsing dots
- The bubble uses the same visual styling as AI actor messages (Bot icon + actor label + primary border)
- The dots animate with a staggered CSS pulse using Tailwind's `animate-bounce` with `animation-delay`

### Visual Design

The typing indicator will look like a regular AI actor message bubble but instead of text content, it shows three bouncing dots:

```text
 [Bot icon] Guest AI
 . . .    (bouncing dots, staggered)
```

Styled with `border-primary/30 bg-primary/5` to match existing AI actor message styling. Each dot is a small circle with `animate-bounce` and staggered delays (0ms, 150ms, 300ms).

### 4. Add CSS for staggered bounce animation

Add a small utility style in `src/index.css` for the staggered animation delays, since Tailwind doesn't support `animation-delay` out of the box. Three classes: `delay-0`, `delay-150`, `delay-300`.

**File:** `src/index.css`
- Add `.typing-dot-1`, `.typing-dot-2`, `.typing-dot-3` with increasing `animation-delay` values

## Technical Notes

- No database changes
- No edge function changes
- The typing state automatically clears on error (via `finally` block), so it never gets stuck
- The indicator only shows in the message thread matching the actor's target booking, not globally
- When actors are disabled, `actorTyping` is always null

