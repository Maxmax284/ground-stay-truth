# Discount / Adjustment UX Overhaul

Four scoped, additive changes. No changes to `apply-booking-adjustment` edge function, Stripe, or pricing math. All existing gating rules stay intact (lock after any recorded payment).

---

## 1. Clearer labels + tooltips (BookingDetailSheet, InquiryQueue, BookingAdjustmentsCard)

- Wrap the "Apply discount" button in a `Tooltip`:
  - Enabled state: "Applies a discretionary discount before payment. Recomputes total, deposit, and voids any unpaid link."
  - Locked state: shows the exact `discountBlockedReason` (e.g. "Locked — a payment has been recorded. Use a refund instead.").
- Add a small helper caption under the button ("Admins & managers only · Before deposit is paid").
- Add a `Lock` icon + muted styling when locked so the reason is visually obvious, not just on hover.
- Same treatment for the new `%` quick-button on Inquiry rows / Calendar hover / Bookings table.

## 2. New admin page: `/adjustments`

New route + sidebar link (admin + manager only, gated via `permissions`).

Route wiring:
- `src/pages/AdjustmentsCenter.tsx` — new page
- `src/App.tsx` — register `/adjustments`
- `src/lib/permissions.ts` — add to `NAV_ACCESS` (`admin`, `manager`)
- `src/components/AppSidebar.tsx` — add "Adjustments" nav item (Percent icon)
- `src/components/DashboardLayout.tsx` — breadcrumb mapping
- `src/i18n/locales/en.json` — `nav.adjustments`, `adjustments.*` keys

Page layout:
```text
┌──────────────────────────────────────────────────────┐
│ Adjustments Center            [Search booking/guest] │
├──────────────────────────────────────────────────────┤
│ Filters:  [Status ▾] [Type ▾] [Applied by ▾] [Range] │
├──────────────────────────────────────────────────────┤
│ When    Booking   Guest   Unit   Value  Label  Actor │
│ ...one row per adjustment...                         │
│                                                      │
│ Row actions: [View booking] [Void] (admin only)      │
└──────────────────────────────────────────────────────┘
```

Data:
- New hook `src/hooks/useAdjustments.ts` — `useAllAdjustments(filters)` joins `booking_adjustments` → `bookings` → `units` → `profiles` (via existing RLS, no new policies).
- Reuses `apply-booking-adjustment` edge function with `action: "void"` for the void action.
- Reuses `ApplyDiscountDialog` for the "Apply to a booking" flow (opened from a "Apply to booking…" button in the page header — asks for a booking id/search first).

## 3. Quick `%` "Apply discount" button on Calendar + Bookings table

- **Calendar hover-card**: `src/components/CalendarBookingChip.tsx` (or wherever the hover Popover lives — locate first). Add a compact `%` icon-button next to the existing quick actions. Admin/manager only. Opens `ApplyDiscountDialog` inline. If any payment recorded → button shown but disabled with tooltip explaining lock.
- **Bookings table** (`src/pages/Bookings.tsx`): add a `%` icon-button in the row action column, same rules.
- Both reuse the same lock-detection logic already in `BookingDetailSheet`: check for any `payments` row with `status = 'recorded'`.

Extract the lock check into a small helper `src/lib/discountEligibility.ts` (`getDiscountLockReason(booking, payments)`) so all four surfaces (sheet, inquiry, calendar, bookings) apply identical rules — single source of truth.

## 4. Audit trail view from booking sheet

- Extend `BookingAdjustmentsCard` with an expandable "History" section that lists every adjustment (active + voided) for the booking:
  - `applied_at`, `applied_by` (resolved to email/name), `value_type + value`, `amount_calculated`, `label`, `internal_note`
  - If voided: show `voided_by`, `voided_at`, `void_reason` inline
- Add a "View full audit" link that opens a modal with the same data + associated `booking_state_log` entries around the adjustment time (read-only).
- The `voided`/`active` state chip and actor email are already available via RLS — no new server work.

## Technical Notes (for dev)

- No schema changes required. `booking_adjustments` already stores full actor + timestamps + void metadata.
- Reuse existing edge function; the only new capability is *listing across bookings*, which is a plain read (RLS lets admin/manager see all).
- No touching of Stripe, webhooks, refunds, or payment totals logic.
- Sidebar entry only shows for `admin` + `manager` (front desk sees discounts on the booking sheet, not the global page).

## Out of Scope

- Bulk apply / bulk void
- Discount templates or presets
- Email notification when a discount is voided
- Exporting adjustments to CSV (can be a Phase 2 add if you want it)

Approve and I'll ship all four in one pass.
