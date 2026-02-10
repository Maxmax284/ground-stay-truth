

# Ground Stay -- Full Validation & Gap Analysis

## Summary

The vast majority of the system described in the constitution is **implemented and functional**. Auth, roles, booking state machine, calendar, pricing, payments, embeds, guest portal, messaging, and reports all exist with proper enforcement. Below is a section-by-section validation with gaps clearly marked.

---

## A) AUTH + ROLES -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Named accounts enforced | PASS | Standard email/password signup with full_name field |
| Pending Access screen | PASS | `ProtectedRoute.tsx` blocks users with null role |
| Role assignment UI | PASS | `UserRoleManager.tsx` with search by name/email |
| Highest-authority role resolution | PASS | `useAuth.tsx` picks max from `ROLE_PRIORITY` |
| Supervisor role hard cap (2-3) | **GAP** | No backend or UI enforcement of supervisor count limit |

**Action needed (Supervisor cap):**
- Add a count check in `UserRoleManager.tsx` when assigning `front_desk_supervisor` -- if 2+ already exist, show an explanatory warning: "Maximum of 2 supervisors allowed. Remove an existing supervisor first."
- Optionally enforce via a database trigger for backend safety.

---

## B) ROUTE + ACTION VISIBILITY -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Nav items hidden for unauthorized roles | PASS | `AppSidebar.tsx` filters by `canAccessRoute()` |
| Action buttons hidden based on role | PASS | `canCreateBooking`, `canManageUnits`, etc. gate UI buttons |
| Blocked actions explain "Why" + "Who can approve" | **GAP** | When a button is hidden, there is no explanation. Users see nothing rather than "You don't have permission. Contact a Manager." |

**Action needed:**
- Where critical actions are hidden (e.g., check-in completion for front_desk), consider adding a muted helper text: "A Supervisor must complete this step." Currently only the state transition panel handles this gracefully; other hidden buttons are simply invisible.

---

## C) UNITS & INVENTORY -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Units CRUD | PASS | Full create/edit/delete with photos and groups |
| Active/Inactive toggle | PASS | Toggle button on unit cards with visual opacity change |
| UI explains "Inactive = hidden from guests" | **GAP** | No explanatory copy near the Deactivate button |
| Embed generator excludes inactive units | PASS | `activeUnits` filter in `EmbedCodeGenerator.tsx` |
| Guest portal excludes inactive units | PASS | `.eq("is_active", true)` in `GuestPortal.tsx` |

**Action needed:**
- Add a one-line helper text near the Active/Inactive badge or toggle: "Inactive units are hidden from guest views, embeds, and availability searches."

---

## D) BOOKING STATE MACHINE -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| 9 states implemented | PASS | `bookingStateMachine.ts` with all states and transitions |
| State badges consistent everywhere | PASS | Same `STATE_LABELS` and `STATE_VARIANTS` used in bookings, calendar, detail sheet, messages, guest portal |
| Countdown: Soft Hold expiration | PASS | `BookingStatusBadge` and `BookingDetailSheet` both show remaining hours and "Expired" badge |
| Countdown: Pending Deposit deadline | PASS | Same countdown logic for deposit deadline |
| Transition reasons always required | PASS | `BookingStateTransition.tsx` validates non-empty reason |
| Admin Override clearly labeled | PASS | `[ADMIN OVERRIDE]` prefix prepended to reason text |
| "System Action" entries visually distinct in audit log | **GAP** | Audit log entries do not differentiate human vs system actions. All entries look the same (same dot icon, same styling) |

**Action needed:**
- In `StateHistoryTab` within `BookingDetailSheet.tsx`, check if `changed_by` is null (system) or if reason starts with `[ADMIN OVERRIDE]`, and style those entries distinctly (e.g., different dot color, a "System" or "Admin Override" badge).

---

## E) FRONT DESK FLOW -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Front Desk can start check-in prep | PASS | Can transition states up to `confirmed`, upload docs |
| Front Desk can upload ID docs | PASS | `canUploadDocuments` check in `GuestDocumentUpload.tsx` |
| Front Desk cannot complete check-in | PASS | `canCompleteCheckIn` requires Supervisor+ in `BookingStateTransition.tsx` |
| Front Desk cannot see payment amounts | PASS | `canViewPaymentAmounts` returns false for `front_desk` -- they see "Paid"/"Unpaid" badges only |
| Supervisor can complete check-in/out | PASS | `canCompleteCheckIn` and `canCompleteCheckOut` check Supervisor+ |
| Supervisor sees payment STATUS only | **ISSUE** | `canViewPaymentAmounts` returns true for `front_desk_supervisor` (hierarchy >= supervisor). Per the constitution, supervisors should see STATUS ONLY, same as front desk. Only Manager+ should see amounts. |
| Early Check-In: "Manager Approval Required" UI | **NOT IMPLEMENTED** | No early check-in workflow exists. There is no buffer violation check, no escalation button, no approval flow. |
| ID Documents block check-in completion | PASS | `checkInBlocked` logic in `BookingStateTransition.tsx` with explicit error message |

**Actions needed:**
1. **Fix Supervisor payment visibility:** Change `canViewPaymentAmounts` threshold from `front_desk_supervisor` to `manager` in `permissions.ts`.
2. **Early check-in approval flow:** This is a significant feature gap. When a booking attempts to check in earlier than the cleaning buffer allows, the UI should show "Manager Approval Required" with an escalation button. This would need a new approval mechanism (likely a field on the booking or a separate approval table).

---

## F) PAYMENTS -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Front Desk UI never renders amounts | PASS (see E caveat) | `canSeeAmounts` hides dollar values |
| Status chips consistent | PARTIAL | Shows "Paid"/"Unpaid" for non-amount viewers, but no "Offline Recorded" chip |
| Deposit countdown visible | PASS | Countdown in both list badges and detail sheet |
| Guest sees simple status | PASS | Guest portal shows `total_price` but no payment breakdown |
| Payment recording gated by role | PASS | `canRecordPayment` check |

**Action needed:**
- Add an "Offline Recorded" status variant for payments recorded via the offline method, distinguishing them from other payment types in the status chips.

---

## G) CALENDAR -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| No overlaps rendered | PASS | Bookings render as non-overlapping bars per unit row |
| Maintenance blocks visually distinct | PASS | Red hatched pattern with dashed border |
| Buffers visibly enforced | PASS | Cleaning buffer shown as striped pattern with tooltip |
| Guest calendars show "Unavailable" only | PASS | Embed calendar shows red/green, no internal data |
| Click interactions open correct sheets | PASS | `onBookingClick` opens detail sheet, `onCellClick` opens create dialog |
| Legend present | PASS | `CalendarLegend.tsx` includes all states, cleaning buffer, and maintenance |
| Mobile calendar works | PASS | Single-unit 7-day vertical view with unit selector |

No gaps found in calendar.

---

## H) BOOKING DETAIL PANEL -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Overview shows next action + blockers | PARTIAL | Shows soft hold expiration and deposit deadline warnings, but no explicit "Next Action" label |
| History tab: Human vs System actions | **GAP** | All entries styled identically (see D above) |
| Payments tab respects role visibility | PASS | Amount hidden for front desk (with supervisor caveat) |
| Notes vs Guest Messages separated | PASS | `is_internal` switch with "Internal note" / "Guest-visible" labels and badges |
| ID Docs tab required for check-in | PASS | "Required for check-in" badge shown when booking is in confirmed/checked_in state |

**Action needed:**
- Add a "Next Step" summary line at the top of the detail sheet (e.g., "Next: Upload ID documents" or "Next: Record deposit payment") based on current state and missing prerequisites.

---

## I) GUEST PORTAL -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Calm, non-manipulative language | PASS | "View your bookings and browse available accommodations" |
| No urgency or scarcity copy | PASS | No fake countdown, no "only X left" language |
| Clear booking status labels | PASS | Same `STATE_LABELS` used |
| Policies visible and readable | PASS | Dedicated "Policies" tab with cancellation tiers and check-in/out times |
| No internal data leakage | PASS | Messages filtered by `is_internal: false`, no state log exposed |
| Guest can reply to messages | PASS | Reply input for non-terminal booking states |

No gaps found in guest portal.

---

## J) EMBEDS -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| No inactive units exposed | PASS | Edge function `get-availability` filters by `is_active` |
| No internal data exposed | PASS | Only name, description, capacity, pricing, photos, availability |
| Availability read-only | PASS | No write operations in embed widgets |
| Contact URL support | PASS | CTA widget supports `contact_url` parameter |
| Embed generator explains limitations | PARTIAL | Shows "Widgets auto-update from Ground Stay data" but doesn't explicitly say "Embeds are read-only presentation -- they do not create bookings" |

**Action needed:**
- Add a brief note in `EmbedCodeGenerator.tsx`: "Embeds display availability from Ground Stay but do not accept bookings directly. All reservations are managed through Ground Stay."

---

## K) REPORTING -- VALIDATED

| Item | Status | Notes |
|------|--------|-------|
| Charts labeled clearly | PASS | Titles: "Occupancy Rate", "Revenue by Unit", "Booking States", "Blocked vs Bookable Time" |
| No forecasting language | PASS | Reports show historical/current data only |
| Maintenance impact included | PASS | "Blocked vs Bookable Time" chart includes maintenance days |
| Month navigation | PASS | Forward/back controls with range label |

No gaps found in reports.

---

## L) VISUAL BUILDER -- NOT IMPLEMENTED

The Visual Builder / draft-publish workflow is **not implemented at all**. There is no:
- Draft vs Live content distinction
- Preview modes (desktop/tablet/mobile)
- Shared templates
- Publish action or logging

This is a significant future feature, not a gap in existing implementation.

---

## M) AUDIT & EXPLANATION CONSISTENCY -- PARTIAL

| Item | Status | Notes |
|------|--------|-------|
| Users can see "what happened" | PASS | State log in booking detail, recent activity on dashboard |
| Admins can see "who approved" | **GAP** | `changed_by` is stored but not displayed in the UI. Audit log shows timestamp and reason but not the user who performed the action. |
| Front Desk sees outcomes without sensitive data | PASS | Payment amounts hidden, state transitions visible |

**Action needed:**
- Display the `changed_by` user (resolved to name via profiles) in the `StateHistoryTab` for Manager+ roles.

---

## Consolidated Gap List (Prioritized)

### Must Fix (constitutional violations)

1. **Supervisor payment visibility** -- Supervisors currently see payment amounts. Should be STATUS ONLY. One-line fix in `permissions.ts`.
2. **Audit log: who performed action** -- `changed_by` stored but not displayed. Add name resolution in `StateHistoryTab`.
3. **Audit log: system vs human styling** -- No visual distinction between system actions and manual actions.

### Should Add (missing UX explanations)

4. **Inactive unit explanation copy** -- One line near the toggle explaining the consequence.
5. **Embed read-only explanation** -- One line in the generator clarifying embeds don't accept bookings.
6. **Supervisor count cap UI** -- Warning when exceeding 2 supervisors.
7. **"Next Step" summary** in booking detail sheet header.
8. **"Who can approve" helper text** where actions are hidden for lower roles.

### Not Implemented (future features, not gaps)

9. **Early check-in approval flow** -- No buffer violation detection or escalation mechanism.
10. **Visual Builder / Draft-Publish** -- Entire feature scope not started.
11. **iCal sync** -- Not built.
12. **Standalone messaging inbox "read" tracking** -- Current unread count is a heuristic (messages not sent by you = unread), not a real read-receipt system.

---

## Technical Changes Summary

| File | Change | Priority |
|------|--------|----------|
| `src/lib/permissions.ts` | Fix `canViewPaymentAmounts` threshold to `manager` | Must Fix |
| `src/components/BookingDetailSheet.tsx` | Add `changed_by` display and system/override styling in audit log | Must Fix |
| `src/pages/Units.tsx` | Add "Inactive = hidden from guests" helper text | Should Add |
| `src/components/EmbedCodeGenerator.tsx` | Add "read-only, no direct bookings" note | Should Add |
| `src/components/UserRoleManager.tsx` | Add supervisor count warning | Should Add |
| `src/components/BookingDetailSheet.tsx` | Add "Next Step" summary line | Should Add |
| `src/components/BookingStateTransition.tsx` | Add helper text for hidden actions explaining who can perform them | Should Add |

