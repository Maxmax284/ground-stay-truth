

# AI Assistant + Notifications + Multilingual Enhancement

## Scope Assessment

This is a 9-phase request. Some phases are immediately buildable, others need incremental rollout. Here is the complete plan broken into implementable chunks, respecting Ground Stay's constitutional boundaries.

---

## Phase 1 -- AI Circuit Breaker System

### What It Does
Adds toggle settings to `policy_settings` so AI features can be disabled globally or per-role.

### Database Changes
Insert 6 new rows into `policy_settings`:

| Key | Default | Description |
|-----|---------|-------------|
| ai_assistant_enabled | true | Global AI kill switch |
| ai_guest_enabled | true | AI for guest role |
| ai_front_desk_enabled | true | AI for front desk role |
| ai_supervisor_enabled | true | AI for supervisor role |
| ai_manager_enabled | true | AI for manager role |
| ai_admin_enabled | true | AI for admin role |

### Code Changes
- Create `src/hooks/useAISettings.ts` -- reads policy_settings, computes `isAIEnabled(role)` by checking global toggle AND per-role toggle
- Update `PolicySettingsForm.tsx` to render boolean toggles (Switch) for ai_* keys instead of plain text inputs
- All AI components will check `isAIEnabled` before rendering

---

## Phase 2 -- Real-Time Notification Infrastructure

### Database Changes
Create `notifications` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid NOT NULL | Recipient |
| type | text NOT NULL | booking, payment, maintenance, laundry, override |
| reference_id | uuid | FK to the relevant record |
| message | text NOT NULL | Short operational description |
| read | boolean DEFAULT false | |
| created_at | timestamptz DEFAULT now() | |

RLS: Users can read/update own notifications. Admins can manage all. Enable realtime on this table.

Create a database function `notify_user(user_id, type, reference_id, message)` that inserts into notifications. Use this in application code when events occur.

### Code Changes

**New Files:**
- `src/hooks/useNotifications.ts` -- query notifications for current user, mark-as-read mutation, realtime subscription, unread count
- `src/components/NotificationBell.tsx` -- bell icon with badge count, dropdown panel listing recent notifications, mark-as-read on click

**Modified Files:**
- `src/components/DashboardLayout.tsx` -- add NotificationBell to the header bar (top-right)
- `src/components/GuestLayout.tsx` -- add NotificationBell to guest header
- `src/hooks/useBookings.ts` -- after booking state transitions, insert notification for relevant users (guest + assigned staff)
- `src/hooks/useMaintenanceRequests.ts` -- on create/status change, insert notifications
- `src/hooks/useLaundryRequests.ts` -- on status change, insert notifications

### Notification Triggers (in application code, not DB triggers)
- Booking created -> notify admin/manager
- Booking state change -> notify guest + relevant staff
- Maintenance request created -> notify maintenance + manager
- Maintenance urgent -> notify admin
- Laundry status = ready_for_pickup -> notify guest
- Deposit deadline approaching -> notify front desk (checked via polling)

### Mobile Placement
- Bell icon in header bar (not floating)
- Dropdown panel slides down on tap
- No overlap with navigation

---

## Phase 3 -- AI Assistant Layer

### Backend
Create edge function `supabase/functions/ai-assistant/index.ts`:
- Uses Lovable AI gateway (google/gemini-3-flash-preview)
- Accepts `{ mode, context, messages }` where mode is one of: explain, summarize, validate, draft, digest
- System prompt enforces read-only behavior: "You are an operational assistant for Ground Stay. You NEVER execute actions. You only explain, summarize, and suggest."
- Reads from: bookings, booking_state_log, maintenance_requests, laundry_requests, payments, notifications (via Supabase service role client)
- Returns streamed response
- Checks AI circuit breaker settings before processing

### Frontend

**New Files:**
- `src/components/AIAssistantPanel.tsx` -- collapsible chat panel, bottom-right on desktop, floating button on mobile
- `src/hooks/useAIAssistant.ts` -- manages conversation state, sends to edge function, handles streaming

**Modes:**
- **Explain**: User selects a booking/request, asks "What's going on here?" -- AI reads context and explains
- **Summarize**: Dashboard summary of current operational state
- **Validate Action**: Before risky transitions, AI flags warnings (buffer violation, missing docs, payment gaps)
- **Prepare Draft**: In messages tab, "Draft with AI" button generates a reply suggestion
- **Daily Digest**: On-demand summary of arrivals, departures, open issues, deadlines

**Constraints enforced in system prompt:**
- Never use phrases like "I have completed" or "Done"
- Always use "Recommended:", "Option:", "Manager Required:"
- Never imply execution capability
- Respect payment visibility (role passed to edge function, amounts excluded for front_desk)

### Mobile UX
- Floating assistant button: 56px, bottom-right, 16px above bottom nav / safe area
- Opens a bottom sheet (not full screen)
- Collapsible with swipe-down gesture
- Does not overlap navigation or notification bell

---

## Phase 4 -- Multilingual Inbox Translation

### What Changes
The existing i18n system handles UI translation. This phase adds message-level translation for the inbox.

### Backend
Create edge function `supabase/functions/translate-message/index.ts`:
- Uses Lovable AI (google/gemini-3-flash-preview) for translation
- Accepts `{ text, target_language }`
- Returns `{ translated_text, source_language }`
- Stateless -- no storage of translations (computed on-demand, cached client-side)

### Database Changes
Add `preferred_language` column to `profiles` table (text, default 'en').

### Frontend Changes

**Modified Files:**
- `src/components/ProfileEditor.tsx` -- add language preference selector (using existing LanguageSelector pattern)
- `src/pages/Messages.tsx` -- for each message, if sender language differs from viewer preference, show "Translate" button. On click, call translate edge function and show inline translation with "View Original" toggle
- `src/pages/GuestPortal.tsx` (messages section) -- same translate button pattern

**New Files:**
- `src/hooks/useMessageTranslation.ts` -- calls translate-message edge function, caches results in React Query

### Supported Languages (Phase 4)
English, Thai, German (minimum). Extensible to all 9 existing UI languages.

### Constraints
- Original message is never modified
- Translation is display-only, cached in memory
- "View Original" always available
- No auto-rewriting, no tone editing

---

## Phase 5 -- AI Message Draft Assistant

### What Changes
Add "Draft with AI" button to the message compose area in staff inbox.

### Frontend Changes

**Modified Files:**
- `src/components/BookingDetailSheet.tsx` (MessagesTab) -- add "Draft with AI" button next to the send button
- `src/pages/Messages.tsx` -- same pattern if a thread detail view is open

### Flow
1. Staff clicks "Draft with AI"
2. Hook sends booking context + last 5 messages to AI assistant edge function with mode = "draft"
3. AI returns suggested reply
4. Text is inserted into the textarea (not sent)
5. Staff can edit, send, or discard

AI never auto-sends. The draft is just text in the input field.

---

## Phase 6 -- Pre-Flight Decision Checker

### What Changes
Before risky state transitions, an AI warning panel appears.

### Frontend Changes

**Modified Files:**
- `src/components/BookingStateTransition.tsx` -- when a target state is selected, if AI is enabled, call a validation endpoint that checks:
  - Buffer violations
  - Missing documents
  - Payment gaps
  - Supervisor cap (if applicable)
- Display warnings in a yellow info panel above the confirm button
- Warnings are informational only -- staff can still proceed

### Backend
Reuse the existing AI assistant edge function with mode = "validate" and pass the transition context.

---

## Phase 7 -- Mobile UX Optimization

### What Changes
Ensure all new components work on small screens.

- NotificationBell: dropdown becomes a bottom sheet on mobile
- AIAssistantPanel: bottom sheet with safe area padding
- Translate buttons: inline, no layout shift
- All new cards: responsive grid (1 col on mobile, 2 on desktop)

### Testing Targets
- 360x800 (small Android)
- 390x844 (iPhone 14)
- 768x1024 (tablet)

---

## Phase 8 -- Security + Role Enforcement

Built into every phase above:
- AI edge function receives user role and enforces visibility
- Payment amounts excluded from AI context for front_desk role
- Internal notes never sent to guest-facing AI
- Audit trail details not exposed to guests
- All RLS policies enforced at database level
- AI settings checked before any AI feature renders

---

## Phase 9 -- Failsafe Behavior

### What Changes
- `useAISettings` hook returns `{ isAIAvailable }` -- if the edge function is unreachable or disabled, all AI features hide gracefully
- Notifications continue working independently of AI
- Translation falls back to showing original text
- No loading spinners that block core UI
- Error boundary wraps AI panel so crashes don't affect the rest of the app

---

## Implementation Order

| Step | Phase | Estimated Changes |
|------|-------|-------------------|
| 1 | Phase 1: Circuit Breaker | 1 migration, 2 files |
| 2 | Phase 2: Notifications | 1 migration, 4 new files, 4 modified files |
| 3 | Phase 3: AI Assistant | 1 edge function, 2 new files, 2 modified files |
| 4 | Phase 4: Translation | 1 edge function, 1 migration, 2 new files, 3 modified files |
| 5 | Phase 5: Draft Assistant | 2 modified files |
| 6 | Phase 6: Pre-Flight Checker | 1 modified file |
| 7 | Phase 7-9: Polish | Mobile fixes, error boundaries, failsafe wiring |

Total: ~3 migrations, 2 edge functions, ~10 new files, ~12 modified files.

---

## Technical Notes

- **AI Gateway**: Uses Lovable AI at `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY` (already configured)
- **Model**: `google/gemini-3-flash-preview` for all AI features (fast, cost-effective)
- **Streaming**: AI assistant uses SSE streaming for chat; translation and validation use non-streaming calls
- **No push notifications in first pass**: The prompt requests service worker + push. This requires PWA setup which is a separate concern. Phase 2 delivers in-app notifications with realtime. Push can be added later as a PWA enhancement.
- **No database triggers**: All notifications are created in application code (hooks) to maintain explicit control and avoid reserved schema modifications

