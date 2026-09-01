# Audit: upgrading a room after a discount is already applied

Date: 2026-09-01. Scope: real case — Sea View Villa (lower level) 1 → higher level, returning-customer 10% already applied, deposit already paid.

## The live booking

- Booking `b21b15dd-328d-4527-b8ad-02923b108cdb`, state `confirmed`, 2026-09-05 → 2026-09-26 (21 nights), Sea View Villa (lower level) 1.
- `original_total` ฿37,846.20 (rack ฿42,000 less the automatic 9.89% long-stay policy tier).
- Active human discount row in `booking_adjustments`: "Returning customer discount", percent, 10%, ฿3,784.62, applied by staff.
- `total_price` ฿34,061.58. Deposit paid ฿6,812.00 (status recorded).
- No duplicate booking exists for this guest. Nothing to clean up yet.
- Sea View Villa (higher level) 6 and 7 are both free for the full 2026-09-05 → 2026-09-26 range.

Two different discount mechanisms are in play and they behave differently:

1. **Policy discounts** (long-stay tiers, loyalty) live in `policy_settings` and are recomputed by `calculatePricing` every time. Loyalty is enabled at 10% for 2nd stay and stacks with long-stay. These carry forward automatically on any re-quote.
2. **Human discounts** live as rows in `booking_adjustments` and only affect `bookings.total_price` at the moment they are applied. Nothing recomputes them later.

## What exists today

- `booking_segments` + `stay_modifications` + the `modify-stay` edge function support changing the unit, including to a different room type / price tier. Room type change is not a special case — the new unit's rates are used.
- `modify-stay` re-quotes the OLD legs and the NEW legs with the same calculator, so the difference is apples-to-apples and **policy discounts are already applied to both sides** (i.e. the long-stay/loyalty percentage effectively applies to the upgrade difference automatically).
- Admin/manager can waive part or all of the difference; the waiver is written as a `booking_adjustments` discount row and into `stay_modifications`.
- Payments are keyed to `booking_id` and are never touched by `modify-stay`, so a deposit stays attached through a unit change.
- Audit: `stay_modifications` (before/after snapshots, pricing before/after, waived, final, actor), `override_audit_log` via `log_override_event`, plus a `booking_changed` admin alert when stored total and fresh re-quote disagree.
- Price Story (`src/lib/priceStory.ts`) separates policy vs human discounts, shows drift between stored total and fresh math, and surfaces a receipt badge.

## What is broken / missing

1. **`modify-stay` drops existing human discounts.** It sets `bookings.total_price = pricing_after − waived`, ignoring active `booking_adjustments`, and never updates `original_total`. On this booking an upgrade to the higher level would set the total to ฿41,631.82, silently deleting the ฿3,784.62 returning-customer discount and inflating the balance from ฿30,656.64 to ฿34,819.82 (≈฿4,163 over).
2. **The stale discount row survives.** The 10% row stays `active`, so Price Story reports a human discount that is no longer inside the total, and a drift warning fires.
3. **Human discounts cannot be applied or voided once any payment is recorded.** `apply-booking-adjustment` returns 409 `PAYMENT_RECORDED` for both `apply` and `void`. After a deposit, the only way to move money down is an admin/manager waiver inside Modify Stay.
4. **No "apply the same % to the upgrade difference" control.** The waiver field takes an absolute amount, so staff must compute 10% themselves.
5. **No supersede relationship.** There is no `superseded_by` link between bookings and no ledger transfer between bookings, so the "new booking" path has no clean representation.

## Option comparison

| | A: same booking + waiver | B: new booking + manual deposit credit | C: proper upgrade flow |
|---|---|---|---|
| Preserves deposit / payment history | Yes | No — the real payment sits on the old booking | Yes |
| Avoids duplicate bookings | Yes | No | Yes |
| Avoids false outstanding balances | Only if the waiver is set correctly (see below) | No — old booking shows a paid deposit against a cancelled stay, new booking shows a full balance | Yes |
| Avoids fake credits | Yes | No — the "credit" is a hand-typed number with no ledger row | Yes |
| Clean guest history | Yes — one stay, one change entry | No — two unrelated bookings | Yes |
| Stripe consistency | Yes — new link is for the difference only | No — the original charge references the cancelled booking | Yes |
| Clear audit trail | Yes | Weak — a cancellation and an unrelated creation | Yes |
| Price Story accurate | **No, today** — bug 1 and 2 | No | Yes |
| Calendar / housekeeping correct | Yes — segments release the old room and hold the new one | Risky — old room may stay held until cancellation lands | Yes |
| Protects against over-discount / double-counted deposit | Partially — waiver is a free-text amount | No | Yes, with computed figures in a confirmation modal |

Option B is the most dangerous path available and should not be used.

## What Nikki should do today (Option A, with one manual step)

1. Open the booking → Modify Stay.
2. Change the room on the existing leg to Sea View Villa (higher level) 6 or 7 (both confirmed free for the whole range). Do not touch the dates.
3. Check availability, then read the difference the dialog shows: fresh old-room quote ฿37,846.20 → fresh new-room quote ฿41,631.82, difference ฿3,785.62. That difference already has the 9.89% policy discount in it; it does **not** have the returning-customer 10%.
4. In the waiver field (admin/manager only) enter **฿4,163.18** — that is 10% of the new ฿41,631.82. This re-creates the returning-customer discount against the new price, so the final total lands at ฿37,468.64 and the guest owes ฿37,468.64 − ฿6,812.00 = **฿30,656.64**.
5. Reason: `guest_request`. Note verbatim: "Upgrade to Sea View higher level. Returning-customer 10% re-applied to the new total (original 10% row superseded by this waiver)."
6. Leave "request payment" on so the guest gets a link for the balance only.
7. Afterwards the old 10% row cannot be voided (payment recorded), so the note above is what stops the double-read. Expect one drift alert; it is explained by the note.

Do not create a second booking. Do not refund and re-charge.

## What should be built

**Fix first (small, contained):** teach `modify-stay` to carry human adjustments forward.

- Read active `booking_adjustments` for the booking before writing the total.
- Percent rows: recompute against the new `pricing_after`. Fixed rows: carry the amount unchanged.
- Write `original_total = pricing_after − waived` and `total_price = original_total − net active adjustments`.
- Supersede the recomputed percent row (`status = 'superseded'`, new row referencing `modification_id`) so Price Story sees exactly one live discount and drift goes to zero.
- Return the carried-forward discount in the response so the dialog can show it.

**Then the flow:** an Upgrade mode in Modify Stay that pre-computes rather than asking staff for arithmetic — current room/type, new room/type, dates, old discounted total, new rack total, existing discount (policy and human, labelled separately), upgrade difference, discount on the difference, new final total, deposit already collected, new balance or credit, required note. Same booking, no fake payment or credit rows, no automatic refunds, one `stay_modifications` entry, one override log entry.

**Supersede path (only if a same-booking upgrade is ever impossible):** add `bookings.superseded_by` / `supersedes`, mark the old booking `superseded` rather than cancelled with total set to amount already paid (no fake balance), and move the payment with explicit paired ledger rows rather than a typed-in credit.

**Room move reuse:** `src/lib/roomMove.ts` and the calendar drag path already handle unit change + conflict detection, but they assume the price tier does not change. They should route price-tier changes into the same `modify-stay` money path instead of moving the unit silently.

## Tests to add

- Upgrade with an active percent human discount: discount carries at the new price, total and balance correct, one live discount row.
- Upgrade with a fixed human discount: amount carried unchanged.
- Deposit already recorded: payment rows untouched, balance = new total − paid.
- Downgrade with a human discount: produces a credit, never a negative total.
- Waiver + carried discount together: no double discount.
- Price Story after upgrade: drift zero, human discount shown once with the upgrade reason.
- Old room released and new room held in `booking_segments`; housekeeping and calendar follow.
- Non-admin cannot waive; non-ops cannot modify.
