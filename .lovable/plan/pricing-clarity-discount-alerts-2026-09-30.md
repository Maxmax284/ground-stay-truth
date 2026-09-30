# Pricing Clarity + Discount Alerts

Street version: the math is clean. Give the humans the receipt. Nothing here changes a stored price.

## Ground rules
- Read-only explanation layer. No recalculation, no rounding, no writes to `bookings.total_price` or historical `booking_adjustments`.
- No policy auto-changes. The 9.89% tiers stay until an admin changes them on purpose.
- Neutral wording everywhere: "Large pricing adjustment recorded", never "suspicious" or "fraud".
- Guests see amounts and plain labels only. Operator names, roles and internal reasons are staff-only.

## What already exists (the base)
- `PriceStoryBadge` + `usePriceStory` + `src/lib/priceStory.ts`: popover receipt that re-quotes the stay and separates policy vs human discounts. Used in Bookings, BookingDetailSheet, CalendarGrid, BookingFinancialSummary, GuestProfileSheet, GuestPortal.
- `BookingAdjustmentsCard`, `ApplyDiscountDialog`, `apply-booking-adjustment` edge function.
- Alert catalog already has "discount/adjustment applied" and "adjustment voided" events, and a DB trigger `trg_alert_booking_adjustment`.

Plan extends these. No new receipt system.

## Stage 1 — Receipt panel (build first)
"How this price was built", collapsible, under every staff total (BookingFinancialSummary, BookingDetailSheet Payments tab, Bookings card expand).
Lines, top to bottom:
1. Base rate: ฿1,500 × 7 nights = ฿10,500
2. Automatic long-stay discount (9.89%) — "System calculated"
3. Loyalty discount, if any — "System calculated"
4. Manual discount(s) — name, role, reason, date/time (Bangkok)
5. Waived fee(s) — same detail
6. Room total (stored value, shown exactly)
7. Add-ons: "Airport pickup: ฿600 separate add-on"
8. Total paid / Outstanding or Credit (from existing `calculateOutstanding`)

Helper lines, only when they apply:
- Decimals from percentage discount: "This amount has decimals because the automatic long-stay discount is calculated exactly."
- Pickup add-on present: "Not an overpayment — the pickup is billed separately from the room."
- Stored total differs from today's rates: keep the existing "priced before a rate change" note.

"Who does what" footer (short, neutral): System calculates automatic discounts · Admin approves special discounts and waivers · Front desk records collections · Guests book through the booking engine.

Stored total is always the source of truth; re-quote is only for explaining lines.

## Stage 2 — "Manual discount applied" badge
- Shown only when an active human adjustment exists (reuses the batch `useBookingDiscountFlags`, one query per list).
- Label changes from "−฿X" to "Manual discount applied" (keep the amount as a secondary line); expand = approver, role, reason, amount, date/time.
- Policy-only discounts keep the quieter info-coloured badge. No badge at all when neither exists.

## Stage 3 — Large adjustment alert
- New policy key `large_adjustment_alert_threshold` (default ฿10,000), admin-editable in Settings → Policies, change logged via existing `policy_settings_history`.
- In `apply-booking-adjustment` (server side, after a successful insert): if the adjustment is manual discount or waiver and |amount| ≥ threshold, emit `large_pricing_adjustment` via `emitAdminAlert`.
- Payload: booking ID + confirmation number, guest name, amount, operator name + role, reason, timestamp, before/after total, deep link to booking → Adjustments with the adjustment id.
- Add catalog entry in both `src/lib/adminAlertCatalog.ts` and `supabase/functions/_shared/adminAlertCatalog.ts`: label "Large pricing adjustment recorded", severity notice (not critical), next action "Glance at the reason — for visibility only."
- Below threshold: existing ordinary adjustment alert only, nothing new.
- Respects existing throttling / critical-only settings.

## Stage 4 — Future long-stay policy note (admin only)
- In Settings → Policies long-stay section: read-only note "Current tiers produce decimal totals (e.g. 9.89%). A round number like 10% gives cleaner totals on future bookings only."
- Optional "Preview with 10%" calculator that shows sample totals side by side. It never saves. Changing the real value stays the normal manual edit.
- Explicit copy: "Existing bookings are not recalculated."

## Stage 5 — Guest-safe receipt
- Guest portal (GuestPaymentSummary / guest PriceStoryBadge usage): shows base × nights, "Long-stay discount", "Discount applied", "Fee waived", "Airport pickup (separate)", paid, outstanding. No operator names, roles or internal reasons.
- Filter happens in the builder (`audience: "guest" | "staff"`), not by CSS hiding.

## Stage 6 — Audit integrity check
- Verify (read query) that `booking_adjustments` has no UPDATE/DELETE policy for staff beyond status → voided/superseded by admin; if it does, add a migration to lock it (void = new status + audit row, never delete).
- Confirm every apply/void writes `override_audit_log`. Fix only if a gap is found.

## Tests (vitest)
- `priceStory` builder: 7-night 9.89% case yields exact ฿9,461.55 and the decimal helper line; round totals get no helper.
- Manual discount → badge "Manual discount applied" with approver/reason/date; none → no badge.
- Threshold helper: ≥ ฿10,000 fires, ฿9,999 does not, custom threshold honoured, policy discounts never fire.
- Pickup ฿600 addon listed separately; paid − room total = 600 shows the add-on note, not a mismatch.
- Stored total rendered unchanged even when re-quote differs (no recalculation path).
- Snapshot: builder is pure — no Supabase writes invoked.
- Guest audience output contains no operator name, role, or reason.
- Staff vs admin audience shows full detail.
- Wording test: no "fraud"/"suspicious" strings in new copy.

## Build order
1 → 2 → 5 (all display-only, zero risk) → 3 (alert, server side) → 6 (integrity check) → 4 (admin note).

## Risks
- Re-quote vs stored total drift on old bookings: mitigated by always showing the stored total and labelling drift, never replacing it.
- Profiles RLS may hide operator names from some staff roles: use the existing actor resolution (override_audit_log actor fields) with "Staff" fallback.
- Alert noise: threshold configurable, notice severity, existing throttle.
- i18n: new strings need EN/TH at minimum; coverage gate must pass.

## Technical notes — files to inspect/change
- `src/lib/priceStory.ts`, `src/hooks/usePriceStory.ts`, `src/components/PriceStoryBadge.tsx`
- `src/components/BookingFinancialSummary.tsx`, `BookingDetailSheet.tsx`, `BookingAdjustmentsCard.tsx`, `GuestPaymentSummary.tsx`, `src/pages/Bookings.tsx`, `GuestPortal.tsx`
- `src/lib/paymentTypes.ts` (`calculateOutstanding`, addon totals), `src/lib/pricingCalculator.ts` (read only)
- `supabase/functions/apply-booking-adjustment/index.ts`, `_shared/adminAlert.ts`, both `adminAlertCatalog.ts`
- Tables: `booking_adjustments`, `policy_settings`, `policy_settings_history`, `override_audit_log`, `admin_alert_log`, `payments`
- Settings → Policies UI for threshold + future-tier note
