
# Repeat Guest Recognition System

## Overview

Detect returning fighters/guests based on their completed booking history and provide two capabilities: **automatic welcome-back messages** (always on) and **loyalty pricing discounts** (admin-controlled with guardrails). This follows the existing pattern: all configurable values live in `policy_settings`, admins control toggles, humans decide, system enforces.

## What Gets Built

### 1. New Policy Settings (Admin Toggles)

Four new entries in `policy_settings`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `loyalty_pricing_enabled` | boolean | `false` | Master kill switch for loyalty discounts |
| `loyalty_2nd_stay_discount_percentage` | number | `0` | Discount % for 2nd completed stay |
| `loyalty_3rd_stay_discount_percentage` | number | `0` | Discount % for 3+ completed stays |
| `loyalty_discount_stacks_with_long_stay` | boolean | `false` | Whether loyalty can stack with long-stay discounts |

Welcome-back messages are always active -- no toggle needed. Returning guests always deserve recognition. Loyalty **pricing** requires the admin to explicitly enable it AND set percentages above zero, so there are two layers of guardrails.

### 2. Repeat Guest Detection

A new hook `useGuestHistory` that, given a `guest_id`, queries completed bookings for that guest:

```text
SELECT COUNT(*) as completed_stays
FROM bookings
WHERE guest_id = :id
  AND state IN ('completed', 'checked_in')
```

Returns `{ completedStays: number, isReturning: boolean }`.

This hook is used in:
- **BookingDetailSheet** (staff view): shows a returning guest badge
- **GuestPortal**: shows a personalized welcome-back card
- **BookingFormDialog / GuestBookingRequestForm**: feeds into pricing calculator

### 3. Pricing Calculator Extension

Extend `pricingCalculator.ts` with a new `getLoyaltyDiscount` function:

- Only activates if `loyalty_pricing_enabled` is `true`
- Checks `completedStays` count against tiers (2nd stay, 3rd+ stay)
- Returns `{ tierLabel, percentage, amount }` or `null`
- If `loyalty_discount_stacks_with_long_stay` is `false` (default), uses whichever discount is higher (loyalty or long-stay), not both
- Applied after subtotal, before cleaning fee -- same position as long-stay discount

The `PricingSummary` interface gains a new optional field: `loyaltyDiscount: LoyaltyDiscount | null`.

### 4. UI Changes

**Guest Portal** -- Welcome-back card at the top of the portal for returning guests:
- "Welcome back! This is your Nth stay with us."
- Warm, personal tone -- no pricing details here, just recognition

**BookingDetailSheet** (staff side) -- Badge next to guest name:
- "Returning Guest (3 stays)" badge in a distinct color
- If loyalty pricing applied, shows in the pricing breakdown

**BookingFormDialog + GuestBookingRequestForm** -- Price breakdown section:
- New line item showing loyalty discount (when applicable)
- Only visible when `loyalty_pricing_enabled` is `true` and guest qualifies

**PolicySettingsForm** -- The four new settings automatically appear in the admin Policies tab using the existing rendering logic. The boolean keys (`loyalty_pricing_enabled`, `loyalty_discount_stacks_with_long_stay`) render as toggle switches; the percentage keys render as number inputs.

### 5. Admin Guardrails

- Loyalty pricing is **off by default** -- admin must flip the toggle
- Even when enabled, percentages default to **0** -- admin must set them
- Stacking is **off by default** -- admin must explicitly allow it
- Welcome-back messages have no toggle because they carry no financial impact
- All discount applications logged in `booking_state_log` via existing audit trail

## Technical Details

### Database Changes
- Insert 4 new rows into `policy_settings` (data insert, no schema change)

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useGuestHistory.ts` | **New** -- hook to count completed stays for a guest |
| `src/lib/pricingCalculator.ts` | Add `getLoyaltyDiscount()`, update `calculatePricing()` and `PricingSummary` |
| `src/components/BookingFormDialog.tsx` | Pass guest history into pricing, display loyalty discount line |
| `src/components/GuestBookingRequestForm.tsx` | Same as above for guest-facing form |
| `src/components/BookingDetailSheet.tsx` | Show returning guest badge, loyalty discount in payments |
| `src/pages/GuestPortal.tsx` | Welcome-back card for returning guests |
| `src/components/PolicySettingsForm.tsx` | Add loyalty boolean keys to `BOOLEAN_KEYS` set |
| `src/i18n/locales/en.json` | Add loyalty/returning guest translation keys |
| `src/i18n/locales/*.json` | Propagate translation keys to all 8 other locales |

### No Schema Migration Required
All new configuration lives as rows in the existing `policy_settings` table. No new tables or columns needed.

### Stacking Logic (Pseudocode)

```text
longStay = getLongStayDiscount(nights, subtotal, policies)
loyalty  = getLoyaltyDiscount(completedStays, subtotal, policies)

if both apply AND stacking disabled:
  use whichever has the higher amount
else if both apply AND stacking enabled:
  apply both sequentially (loyalty on subtotal, then long-stay on remainder)
else:
  apply whichever one exists
```
