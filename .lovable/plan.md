

# Super Admin Authority Lock — Eliminating "He Said She Said"

## The Problem (Real Talk)

Right now, a Manager can approve bookings, dismiss inquiries, and send messages to guests without the Admin ever signing off. The Admin finds out *after* the fact through a notification. That's not control — that's an FYI. If a Manager promises a guest something the Admin never approved, or dismisses an inquiry the Admin wanted to hold, there's no undo button. The damage is done, and now you've got a "he said she said" situation with a real guest caught in the middle.

## The Fix: Admin-Gated Approval + Message Review

### 1. Booking Approvals — Admin-Only Execution

**Current**: Manager+ can approve/reject bookings in the Approval Queue.
**New**: Only Admin can approve or reject bookings. Managers get read-only visibility (same as Supervisors today) plus the ability to **recommend** approve/reject with a note, but the actual state transition is locked to Admin.

**Changes:**
- `permissions.ts`: Change `canApproveBooking` from `Manager+` to `admin` only
- `ApprovalQueue.tsx`: When role is Manager, show a "Recommend" button instead of Approve/Reject. The recommendation writes a note to the booking (visible in the audit log) but does NOT transition the state.
- Add a `booking_recommendations` concept — store Manager recommendations as internal messages or a dedicated field on the booking, so the Admin sees "Manager X recommends approval because Y" when they open the queue.
- The Approval Queue buttons (Approve/Reject) only render for Admin role.

### 2. Inquiry Queue — Admin-Only Dismissal

**Current**: Manager+ can Hold or Dismiss inquiries.
**New**: Any staff Manager+ can still **Hold** an inquiry (low-risk, reversible). But **Dismiss** (which cancels the booking permanently) is Admin-only.

**Changes:**
- `InquiryQueue.tsx`: Hide the "Dismiss" button for non-Admin roles. Managers can still Hold.
- `permissions.ts`: Add `canDismissInquiry` — Admin only. Keep `canHoldInquiry` at Manager+.

### 3. Message Drafts — Admin Review Before Guest-Facing Messages

**Current**: Any Front Desk+ staff can send messages directly to guests.
**New**: Non-admin staff compose messages as **drafts**. Guest-facing drafts require Admin approval before delivery. Internal notes remain instant (staff-to-staff doesn't need gating).

**Changes:**
- Add a `draft` boolean column to the `messages` table (default `false`)
- Add an `approved_by` UUID column (nullable)
- When a non-Admin sends a guest-facing message (`is_internal = false`), it saves as `draft = true` instead of being immediately visible to the guest
- RLS update: Guests can only read messages where `draft = false`
- New **Message Approval Queue** on the Admin dashboard showing pending drafts with Approve/Reject buttons
- When Admin approves: sets `draft = false`, `approved_by = admin_id`, message becomes visible to guest
- When Admin rejects: deletes or marks the draft with a rejection note, notifies the sender
- Admin's own guest-facing messages bypass the draft flow (sent immediately)

### 4. State Transition Authority Tightening

**Current**: Manager can push bookings through most state transitions.
**New**: Critical transitions require Admin sign-off:

| Transition | Current Authority | New Authority |
|---|---|---|
| pending_approval -> pending_deposit | Manager+ | Admin only |
| pending_approval -> cancelled | Manager+ | Admin only |
| pending_deposit -> confirmed | Manager+ (with deposit) | Admin only |
| confirmed -> checked_in | Supervisor+ | Supervisor+ (unchanged) |
| checked_in -> completed | Supervisor+ | Supervisor+ (unchanged) |
| Any admin override | Admin | Admin (unchanged) |
| inquiry -> soft_hold | Manager+ | Manager+ (unchanged, low risk) |
| inquiry -> cancelled | Manager+ | Admin only |

**Changes:**
- `permissions.ts`: Add `canApproveStateTransition` for the critical transitions listed above
- `BookingStateTransition.tsx`: For critical transitions, if user is not Admin, show a "Request Approval" button instead. This creates a notification to Admin with the proposed transition and reason.
- The Admin sees these requests in a unified "Pending Admin Actions" section on the dashboard

### 5. Admin Override on Everything

**Current**: Admin override exists for state machine only.
**New**: Admin override extends to:
- Overriding any Manager recommendation on approvals
- Force-sending or deleting any draft message
- Reversing any hold or dismissal on inquiries
- All existing override capabilities remain

This is already mostly in place (`canAdminOverride` returns true only for `role === "admin"`). The new changes just make sure Managers can't execute the things that need overriding in the first place.

### 6. Audit Trail Enhancement

Every gated action gets logged:
- Manager recommendations logged in `booking_state_log` with a `[RECOMMENDATION]` prefix
- Draft message approvals/rejections logged
- Admin overrides of Manager actions logged with timestamps

No new tables needed for this — the existing `booking_state_log` and `messages` table handle it.

---

## Database Changes

1. **`messages` table**: Add two columns:
   - `draft` (boolean, default `false`) 
   - `approved_by` (uuid, nullable, references auth.users)

2. **RLS policy update on `messages`**: Update guest SELECT policy to include `AND draft = false` condition

3. No other table changes needed — recommendations flow through existing `booking_state_log` and internal messages

---

## File Changes Summary

| File | Change |
|---|---|
| `src/lib/permissions.ts` | Add `canDismissInquiry`, `canApproveStateTransition`, update `canApproveBooking` to admin-only |
| `src/components/ApprovalQueue.tsx` | Manager sees "Recommend" button, Admin sees Approve/Reject |
| `src/components/InquiryQueue.tsx` | Hide Dismiss for non-Admin, keep Hold for Manager+ |
| `src/components/BookingStateTransition.tsx` | Gate critical transitions, show "Request Approval" for Manager |
| `src/pages/Messages.tsx` | Draft indicator on pending messages |
| `src/hooks/useBookings.ts` | Add draft message creation logic, approval mutation |
| `src/pages/Index.tsx` (Dashboard) | Add "Pending Admin Actions" section showing draft messages + transition requests |
| Database migration | Add `draft` and `approved_by` columns to messages, update RLS |

---

## What This Guarantees

- A Manager cannot approve, reject, or cancel a booking without Admin sign-off
- A Manager cannot dismiss a guest inquiry permanently  
- No guest-facing message goes out without Admin eyes on it (unless Admin sent it themselves)
- Every recommendation, draft, and override is logged and attributable
- The Admin has a single dashboard view of everything waiting for their decision
- Operational flow isn't blocked — Managers can still hold inquiries, write drafts, and make recommendations. They just can't pull the trigger on irreversible actions.

