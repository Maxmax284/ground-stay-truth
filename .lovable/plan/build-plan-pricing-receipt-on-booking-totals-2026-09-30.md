# Build plan: Pricing receipt on booking totals

## Goal
Give staff a clear, expandable receipt wherever they inspect a booking’s money, without changing any stored total, discount, payment, or pickup rule.

## Current state confirmed
- The read-only `PriceBuildPanel` and discount badge already exist.
- The main booking financial summary already renders both.
- The Payments tab shows the badge but does not yet show the expandable receipt.
- Compact booking rows/cards and guest history rows already show the badge; these should stay compact rather than embedding a full receipt.
- Airport pickup is already calculated as a separate add-on and the existing helper can label it explicitly.

## Implementation
1. **Finish the expandable receipt**
   - Keep “How this price was built” directly under the primary total block in the booking financial summary.
   - Add the same expandable panel to the booking Payments tab, using that tab’s existing paid, outstanding, credit, and add-on figures.
   - Keep it collapsed by default and load the detailed quote only when opened.

2. **Make the breakdown plain and complete**
   - Show published room total and nights, automatic long-stay/loyalty discounts, active manual discounts or surcharges, stored room total, total paid, outstanding balance or credit.
   - Show staff-only adjustment context: approver, reason, and Bangkok-local timestamp when available.
   - Explain decimal totals only when an exact percentage discount caused them.
   - If current rates differ from the saved booking, label the saved total as authoritative; never recalculate history.

3. **Make pickup money impossible to misread**
   - When an add-on obligation exists, show `Airport pickup: ฿X separate add-on` beneath the room total.
   - Add the plain explanation that it is not an overpayment or room-price mismatch.
   - Use the actual add-on amount from the payment ledger, never a hardcoded ฿600 display value.

4. **Keep the badge useful without clutter**
   - Show `Manual discount applied` only when an active human adjustment exists.
   - Keep automatic policy discounts visually distinct.
   - Keep compact badges on booking rows/cards; tapping the booking leads to the full receipt.
   - Show no badge when no discount or surcharge exists.

5. **Safety and visibility rules**
   - No database or pricing-engine changes.
   - No edits, deletes, rounding, or recalculation of historical totals.
   - Internal operator names, roles, and notes remain staff-only; guest-facing summaries expose only safe amount labels.

6. **Verification**
   - Test ordinary, long-stay decimal, manual-discount, pickup-add-on, overpaid/credit, cancelled, and historical-rate-drift bookings.
   - Verify the booking sheet and Payments tab on phone and desktop.
   - Confirm the panel is keyboard-accessible, has one clear expansion control, and does not trigger duplicate quote requests.
   - Run pricing clarity and payment calculation tests, then check the live preview for errors.

## Files likely involved
- `src/components/PriceBuildPanel.tsx`
- `src/components/BookingFinancialSummary.tsx`
- `src/components/BookingDetailSheet.tsx`
- `src/components/PriceStoryBadge.tsx`
- `src/hooks/usePriceStory.ts`
- `src/lib/pricingClarity.ts`
- `src/lib/__tests__/pricingClarity.test.ts`

## Build first
Wire the existing panel into the Payments tab using the same ledger-derived figures as the main financial summary. Then tighten the receipt details and verify badge/pickup behavior across real booking states.
