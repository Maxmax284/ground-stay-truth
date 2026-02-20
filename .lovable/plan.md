

# Critical Gaps Audit -- UI, Backend, and AI Synchronization

## Summary of Findings

After a thorough review of the entire codebase, here are the gaps organized by severity.

---

## Gap 1: Guest Has No Visibility Into Inquiry Status Changes (HIGH)

**Problem**: When staff holds or dismisses an inquiry from the InquiryQueue, the guest gets a generic notification: "Your booking status changed to soft_hold" or "...cancelled." There is no explanation or context. The guest portal booking cards show the state badge but there is no "Next Step" banner for the `inquiry` state that tells the guest what to expect.

**Fix**:
- In `useTransitionBookingState` (useBookings.ts), improve the guest notification message for inquiry transitions specifically:
  - inquiry -> soft_hold: "Your inquiry has been acknowledged and placed on hold. We'll follow up shortly."
  - inquiry -> cancelled: "Your inquiry for [Unit] could not be accommodated. Reason: [reason]"
- The `BookingDetailSheet` already has a `nextStep` for "inquiry" state, but it only says a generic string. This is fine for staff but the guest portal `GuestBookingCard` component should also display the next-step context inline.

**Files to modify**:
- `src/hooks/useBookings.ts` -- Enrich guest notification messages for inquiry-specific transitions
- `src/i18n/locales/en.json` -- Add new notification message templates

---

## Gap 2: AI (Kru) Not Present in Inquiry Queue Context (MEDIUM)

**Problem**: The AI pre-flight checker runs on state transitions inside `BookingStateTransition.tsx`, but the InquiryQueue uses its own inline transition calls (hold/dismiss) that bypass the BookingStateTransition component entirely. This means Kru never gets a chance to advise on inquiry decisions -- e.g., flagging that a unit is already at capacity for those dates, or that maintenance is scheduled.

**Fix**:
- Add an optional AI advisory tooltip/banner to each InquiryQueue item that fetches a lightweight Kru "validate" check before the staff member clicks Hold. This runs asynchronously and is purely informational.
- The check should include: date overlap warnings, maintenance block conflicts, and capacity concerns.

**Files to modify**:
- `src/components/InquiryQueue.tsx` -- Add AI advisory per inquiry item (lazy-loaded, non-blocking)
- `src/hooks/useAISettings.ts` -- Already works, just import and use

---

## Gap 3: AI Not Surfaced on Guest Portal (MEDIUM)

**Problem**: The `AIAssistantPanel` (Kru) is rendered in both `DashboardLayout` and `GuestLayout`. The AI edge function correctly filters by role (guest gets no internal data). However, the guest-facing Kru has no awareness of the guest's own bookings. It fetches a global property snapshot but doesn't include "your booking is in inquiry state" or "your check-in is in 3 days" context.

**Fix**:
- When mode is chat (explain/summarize/camp/draft) and the caller is a guest, the AI edge function should also fetch the caller's own bookings and include them in the context. This gives Kru the ability to say "Your booking for Beach House A is confirmed, check-in is Feb 25."
- Guard: Only include the guest's own data, never other guests' data.

**Files to modify**:
- `supabase/functions/ai-assistant/index.ts` -- When role is "guest", fetch the caller's bookings and append to context

---

## Gap 4: Notification Messages Not Localized (MEDIUM)

**Problem**: All notification messages are hardcoded in English (e.g., "Your booking status changed to soft_hold", "New guest inquiry: Beach House A..."). Since the platform supports 9 languages and guests set a preferred language, notifications should be in the guest's language. Staff notifications can stay English since staff operate in a shared language.

**Fix**:
- Store the raw notification data (type, reference_id) and use client-side translation in `NotificationBell` to render localized text, rather than storing pre-rendered English strings.
- **Alternative (simpler)**: Keep the current architecture but translate the guest-facing messages at creation time by looking up the guest's `preferred_language` from their profile.

**Files to modify**:
- `src/hooks/useBookings.ts` -- Look up guest preferred_language before creating guest notifications, pass language hint
- `supabase/functions/create-notification/index.ts` -- Optionally accept a `language` field for future use
- `src/components/NotificationBell.tsx` -- Consider rendering with translation keys instead of raw strings

---

## Gap 5: `stay_support_log` INSERT Policy Too Permissive (LOW-MEDIUM)

**Problem**: The `stay_support_log` table has an INSERT policy: `auth.uid() IS NOT NULL`. This is the same pattern we just fixed on notifications -- any authenticated user can insert a log entry for any booking, including bookings they don't own. While this table is less sensitive than notifications (it's an audit trail), it still allows a malicious guest to inject fake audit entries.

**Fix**:
- Tighten the INSERT policy to either:
  - Restrict to service role only (like notifications) by moving inserts to an edge function, OR
  - Restrict to: guest can only insert for their own bookings, staff (front_desk+) can insert for any booking.

**Database migration**: Update RLS policy on `stay_support_log`

---

## Gap 6: Missing `front_desk_supervisor` in Inquiry/Approval Queue Visibility (LOW)

**Problem**: The InquiryQueue and ApprovalQueue are gated by `permissions.canApproveBooking(effectiveRole)`, which requires Manager+. But `front_desk_supervisor` should at minimum be able to *see* these queues (read-only), even if they can't approve. Currently supervisors land on the dashboard and have no visibility into pending inquiries or approvals unless they navigate to the Bookings page and filter manually.

**Fix**:
- Show InquiryQueue and ApprovalQueue to supervisors in read-only mode (hide the action buttons when the role lacks `canApproveBooking`).

**Files to modify**:
- `src/pages/Index.tsx` -- Change the visibility gate from `canApprove` to `canViewQueues` (supervisor+)
- `src/components/InquiryQueue.tsx` -- Accept a `readOnly` prop to hide Hold/Dismiss buttons
- `src/components/ApprovalQueue.tsx` -- Accept a `readOnly` prop to hide Approve/Reject buttons

---

## Implementation Priority

1. **Gap 1** (Guest inquiry notifications) -- Quick win, high user impact
2. **Gap 5** (stay_support_log RLS) -- Security fix, consistent with notification hardening
3. **Gap 2** (AI on InquiryQueue) -- Brings Kru into the new workflow
4. **Gap 3** (AI guest context) -- Makes Kru useful for guests
5. **Gap 6** (Supervisor queue visibility) -- Small UX improvement
6. **Gap 4** (Notification localization) -- Larger effort, can be phased

## Technical Notes

- Gaps 1, 2, 3, and 6 are purely frontend/edge-function changes with no database schema modifications
- Gap 5 requires a database migration (RLS policy update)
- Gap 4 is architecturally significant and could be split into a separate phase
- All AI additions follow the existing pattern: advisory only, no state changes, circuit-breaker respected

