# Modify Stay: keep old receipts, charge clean new nights

## Root cause (confirmed)

1. **Loyalty leak (already fixed).** Guest history used to count the guest's own `checked_in` stay as a finished stay, so the new leg got a second 10% off (฿7,380.01 instead of ฿8,200.01). It now counts only `completed` stays and skips the booking itself. The loyalty switch is still off.
2. **Rewriting the past (still open).** When a change is saved, the server sets
   `total_price = full re-quote of every leg − active adjustments`.
   For Lucrezia that means ฿17,571.45 instead of ฿16,634.31, which creates a fake ฿937.14 balance. It also recalculates percent adjustments against the *whole* new stay price, so an old discount gets resized across the past nights too.
   The *charge* is already worked out as a difference. Only the *saved total* rewrites history.

## Decision needed (why this is a plan, not a patch)

There are two safe ways to work out the "clean delta":

- **A. Leg-level delta (recommended).** Legs that haven't changed (same room, same dates, or only the start of the stay before the change) keep their recorded share. New or changed nights are priced fresh. Delta = price of the new nights − price of the removed nights (removed nights are priced at their recorded share, so a refund never goes above what was paid).
- **B. Whole-stay delta.** Delta = after-quote − before-quote, both re-priced today. This is simpler, but if a tier changes (e.g. a 5-night stay becomes 8 nights) it can quietly give the past nights a long-stay discount too.

I'd go with **A**. For Lucrezia it gives exactly ฿8,200.01: Room 11 is unchanged, and Room 12 for Oct 8 → 15 is priced on its own.

## What changes

**Server (`modify-stay`)**
- New mode: `pricing_mode: "preserve" | "full_reprice"`.
  - `preserve` (default for any booking that has a payment, or whose state is confirmed/checked_in): `total_price = on_record_total + approved_delta − waiver`. The server reloads `on_record_total` from the booking itself and doesn't trust the client's number.
  - `full_reprice` is allowed only when nothing has been paid (no completed payments) and the state is inquiry/soft_hold/pending_*. Otherwise it's rejected with 409.
- Existing percent adjustments: in preserve mode they stay as they are. They aren't superseded or resized; they belong to the old nights. Fixed adjustments are untouched. The full_reprice path keeps today's carry-forward behaviour.
- Mode, on-record total, delta and the clean re-quote are all saved in `stay_modifications.after_snapshot` and the override log, so it can be audited.
- Payments, deposits, past adjustments and booking state are never written. Rooms change only through the segments staff confirm.

**Dialog (`ModifyStayDialog.tsx`)**
- Money section split into four labelled rows: Stored current total, Clean re-quote (info only), This change (delta), New booking total.
- A per-new-leg breakdown: nights × rate = base, long-stay % and amount, loyalty amount (฿0), leg due.
- A drift warning when stored ≠ re-quote: "Existing settled pricing differs from current policy. Past pricing will be preserved. Only the new extension/future segment will be charged."
- Full re-price shows up only as an explicit option, and only on unpaid early-state bookings.

**Pure helper (`modifyStay.ts`)**
- Add `computeChangeDelta(beforeSegs, afterSegs, quotes, onRecordTotal)`. It returns the new/removed nights, the delta and the merged total. The dialog and the tests both use it.
- Long-stay stays **per leg**. That is the current, documented rule and it isn't changed here. (Changing it to per-whole-stay would be a separate decision.)

## Regression tests (`src/lib/__tests__/modifyStayPreserve.test.ts`)
- A: first-time guest who is checked in → loyalty ฿0 on the new leg.
- B: Lucrezia → delta ฿8,200.01, merged ฿16,634.31, never ฿17,571.45.
- C: Room 11 Sep 30–Oct 8 + Room 12 Oct 8–15 → 15 nights, Oct 8 counted once, and the room count doesn't affect price.
- D: 3 nights Standard Single → ฿3,900, no discounts.
- E: 7 nights → ฿9,100 − ฿899.99 = ฿8,200.01.
- F: preserve mode never lowers or raises the past share; shortening gives a refund of at most the recorded share.
- G: unpaid inquiry with full_reprice → total = clean full quote.

## Not touched
Historical payments, deposits, past booking_adjustments rows, booking/check-in/ID state, the loyalty setting, and Lucrezia's existing records.
