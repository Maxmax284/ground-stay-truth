
# Gap Analysis: AI + Notifications + Multilingual -- What Is Missing

## Summary

Most of the 9 phases are implemented. However, there are **5 concrete gaps** where planned functionality was not wired in. Below is a phase-by-phase status and what needs to be added.

---

## Phase 1: AI Circuit Breaker -- COMPLETE

- 6 toggle keys inserted into `policy_settings`
- `useAISettings.ts` hook correctly checks global + per-role toggles
- `PolicySettingsForm.tsx` renders Switch toggles for boolean keys
- Edge function checks circuit breaker before processing
- No gaps.

---

## Phase 2: Notifications -- COMPLETE

- `notifications` table created with RLS + Realtime enabled
- `useNotifications.ts` hook with realtime subscription, mark-as-read, mark-all-read
- `NotificationBell.tsx` integrated into both `DashboardLayout.tsx` and `GuestLayout.tsx`
- Notification triggers added to `useBookings.ts`, `useMaintenanceRequests.ts`, `useLaundryRequests.ts`
- No gaps.

---

## Phase 3: AI Assistant Layer -- COMPLETE

- Edge function `ai-assistant/index.ts` implemented with Lovable AI gateway, streaming, circuit breaker, role-based content filtering
- `useAIAssistant.ts` handles streaming SSE, abort, conversation state
- `AIAssistantPanel.tsx` with 5 modes (explain, summarize, validate, draft, digest), error boundary, mobile placement
- Integrated into `DashboardLayout.tsx` and `GuestLayout.tsx`
- No gaps.

---

## Phase 4: Multilingual Inbox Translation -- MOSTLY COMPLETE, 1 GAP

**Implemented:**
- Edge function `translate-message/index.ts` with structured JSON output
- `useMessageTranslation.ts` hook with client-side cache
- `ProfileEditor.tsx` includes preferred language selector with all 9 languages
- `preferred_language` column on profiles table

**GAP: Translate buttons not wired into message views.**

The `useMessageTranslation` hook exists but is never used in the actual message UI. Neither `MessagesTab` inside `BookingDetailSheet.tsx` (lines 256-302) nor the `Messages.tsx` page renders a "Translate" / "View Original" button on individual messages. The plan specified:

> "For each message, if sender language differs from viewer preference, show 'Translate' button. On click, call translate edge function and show inline translation with 'View Original' toggle."

**Fix needed:**
- In `BookingDetailSheet.tsx` `MessagesTab`, import `useMessageTranslation` and `useProfile`, and for each message render a small "Translate" button that calls `translate()`. When translation exists, show the translated text with a "View Original" toggle.
- Same pattern in `Messages.tsx` if thread detail messages are shown (currently they open `BookingDetailSheet`, so `MessagesTab` is the primary location).

---

## Phase 5: AI Message Draft Assistant -- NOT IMPLEMENTED

The plan specified:

> "Add 'Draft with AI' button to the message compose area in staff inbox."

**Current state:** The `MessagesTab` in `BookingDetailSheet.tsx` (lines 279-301) has a Textarea and Send button, but **no "Draft with AI" button**. The `Messages.tsx` page opens `BookingDetailSheet` for thread detail, so the same gap applies.

**Fix needed:**
- Add a "Draft with AI" button next to the Send button in `MessagesTab`
- On click, gather the last ~5 messages + booking context, call `sendMessage` from `useAIAssistant` with mode = "draft"
- Insert the AI response into the textarea (not auto-send)
- The user can edit, send, or discard

---

## Phase 6: Pre-Flight Decision Checker -- NOT IMPLEMENTED

The plan specified:

> "Before risky state transitions, an AI warning panel appears."

**Current state:** `BookingStateTransition.tsx` has existing non-AI warnings (buffer violations, missing documents, refund info) but **no AI-powered pre-flight check**. The plan called for:

> "When a target state is selected, if AI is enabled, call a validation endpoint... Display warnings in a yellow info panel above the confirm button."

**Fix needed:**
- In `BookingStateTransition.tsx`, when `targetState` changes, if AI is enabled (`useAISettings`), call the AI assistant edge function with `mode: "validate"` and context including: current state, target state, buffer status, document status, payment status
- Display the AI's warnings in an info panel above the Confirm button
- Warnings are informational only -- staff can still proceed

---

## Phase 7: Mobile UX Optimization -- PARTIALLY DONE

**Implemented:**
- AI panel has `bottom-20` on mobile to avoid nav overlap
- NotificationBell uses Popover (works on mobile)
- Responsive layouts exist

**Minor gap:** The plan mentioned the notification dropdown should become a "bottom sheet on mobile" instead of a popover. Currently it uses `PopoverContent` which can be awkward on very small screens. This is a polish item, not blocking.

---

## Phase 8: Security + Role Enforcement -- COMPLETE

- AI edge function filters content by role (no payment amounts for front_desk, no internal notes for guests)
- RLS policies enforce database-level access
- Circuit breaker checked server-side
- No gaps.

---

## Phase 9: Failsafe Behavior -- COMPLETE

- `AIErrorBoundary` wraps the AI panel
- `useAISettings` returns `isAIEnabled: false` when loading or disabled, hiding the panel
- Notifications work independently of AI
- Translation hook handles errors gracefully
- No gaps.

---

## Implementation Plan for Missing Items

### Step 1: Wire translate buttons into MessagesTab (Phase 4 gap)

**File:** `src/components/BookingDetailSheet.tsx`

- Import `useMessageTranslation` and `useProfile`
- In the `MessagesTab` component, call `useMessageTranslation()` and get the user's `preferred_language` from their profile
- For each message in the list, add a small "Translate" button (Globe icon)
- When clicked, call `translate(messageId, messageContent, preferredLanguage)`
- If a translation exists for that message, show it below the original with a "View Original" toggle button
- Keep original content always accessible

### Step 2: Add "Draft with AI" button to MessagesTab (Phase 5)

**File:** `src/components/BookingDetailSheet.tsx`

- Import `useAIAssistant` and `useAISettings`
- In `MessagesTab`, add a "Draft with AI" button (Sparkles icon) next to the Send button
- Only show when AI is enabled for the user's role
- On click:
  1. Gather the last 5 messages as context
  2. Call `sendMessage` with mode "draft" and the booking context
  3. When the AI response arrives, insert it into the textarea's `content` state
  4. The user can then edit and send normally
- Show a loading indicator while the AI is generating

### Step 3: Add AI pre-flight checker to BookingStateTransition (Phase 6)

**File:** `src/components/BookingStateTransition.tsx`

- Import `useAISettings` and add a state for AI validation warnings
- When `targetState` changes to a non-empty value, if AI is enabled:
  1. Call the AI assistant edge function with `mode: "validate"` and context: `{ currentState, targetState, hasDocuments, hasPaid, bufferViolated, bookingId }`
  2. Store the response as a validation message
  3. Display it in a yellow/amber info panel above the Confirm button
- The validation is advisory only -- the Confirm button remains enabled regardless
- If AI is disabled or the call fails, skip silently (no blocking)

---

## Technical Details

### Dependencies
- No new packages needed
- No database changes needed
- No new edge functions needed (reuses existing `ai-assistant` and `translate-message`)

### Files to Create
None.

### Files to Modify
| File | Change |
|------|--------|
| `src/components/BookingDetailSheet.tsx` | Add translate buttons to MessagesTab, add "Draft with AI" button |
| `src/components/BookingStateTransition.tsx` | Add AI pre-flight validation panel |

### Translation Keys to Add (en.json)
- `messages.translate` -- "Translate"
- `messages.viewOriginal` -- "View Original"
- `messages.draftWithAI` -- "Draft with AI"
- `messages.drafting` -- "Drafting..."
- `stateTransition.aiValidation` -- "AI Check"
- `stateTransition.aiChecking` -- "Checking..."

