

# In-Person Deposit Verification Flow

This enhancement formalizes the deposit collection process for in-person payments (cash and card), which is how most deposits will be handled at Lamai Muay Thai. It works entirely within the existing architecture -- no new tables, no new routes, no bolted-on features.

---

## What Already Works

- Staff can record payments with method: cash, card, bank_transfer, offline
- The `pending_deposit` state exists in the booking state machine
- The "Next Step" banner already differentiates between "deposit received" and "awaiting deposit"
- Supervisor+ can record payments; Manager+ can see amounts
- Notifications fire on state transitions
- The guest portal shows booking state and messages

## What's Missing

1. **No deposit-specific guidance for staff** -- when a booking hits `pending_deposit`, there's no clear "Record the deposit to proceed" prompt tied to the transition itself
2. **No guest-facing deposit status** -- the guest sees "Pending Deposit" but has no indication of what to do or that they can pay in person
3. **No deposit verification confirmation** -- recording a payment and confirming a booking are disconnected actions; staff must remember to do both separately
4. **Payment method labels are generic** -- "offline" doesn't communicate "in-person" clearly

---

## Changes

### 1. Enhance the State Transition Panel (`BookingStateTransition.tsx`)

When the booking is in `pending_deposit` and staff selects `confirmed` as the target state:

- Show a deposit verification prompt: "Has the deposit been collected?" with the payment recording form **inline** (amount, method selector, notes)
- If no payment exists yet for this booking, the confirm button changes to "Record Deposit and Confirm"
- This records the payment AND transitions the state in one action
- If a payment already exists, the standard "Confirm Transition" button works as-is

This keeps both actions (record + transition) in one place without changing the state machine or adding new states.

### 2. Improve Guest Booking Card (`GuestPortal.tsx`)

When a guest's booking is in `pending_deposit`:

- Show a clear info banner: "A deposit is required to confirm your booking. You can pay in person at the front desk (cash or card accepted), or contact staff for bank transfer details."
- Show deposit amount if `total_price` is set (referencing any deposit percentage policy)
- Show whether a deposit has been recorded (check existing payments for this booking)

### 3. Add Deposit Percentage Policy Setting

Add a new policy setting `deposit_percentage` (default: 100) so the system knows what percentage of the total price constitutes the required deposit. This makes the deposit amount calculable and displayable.

### 4. Update Payment Method Labels

Rename the "offline" method to "in_person" across the UI for clarity, and ensure cash/card remain as distinct options. The methods become:
- `cash` -- Cash payment
- `card` -- Card payment (in person)
- `bank_transfer` -- Bank transfer
- `online` -- Online payment (future)

### 5. Notify Guest When Deposit is Recorded

When a payment is recorded on a `pending_deposit` booking, send a notification to the guest: "Your deposit has been received. Your booking is now confirmed."

This already partially happens via the state transition notification ("Your booking status changed to confirmed"), but the deposit-specific message adds clarity.

---

## Technical Details

### Database Migration

```sql
-- Add deposit_percentage policy setting
INSERT INTO public.policy_settings (key, value, description)
VALUES (
  'deposit_percentage',
  '100',
  'Percentage of total price required as deposit (0-100)'
) ON CONFLICT DO NOTHING;
```

No schema changes. No new tables. One new policy row.

### Modified Files

| File | Change |
|------|--------|
| `src/components/BookingStateTransition.tsx` | Add inline deposit collection form when transitioning from `pending_deposit` to `confirmed`. Records payment + transitions state in one action. |
| `src/pages/GuestPortal.tsx` | Add deposit info banner on `pending_deposit` bookings showing: amount needed, payment methods accepted, and whether deposit has been received. |
| `src/hooks/useBookings.ts` | Update `useCreatePayment` to also notify the guest when a deposit is recorded on a `pending_deposit` booking. |
| `src/components/BookingDetailSheet.tsx` | Update payment method labels from "offline" to "in_person". Update the Next Step banner for `pending_deposit` to show deposit amount when calculable. |
| `src/i18n/locales/en.json` | Add translation keys for deposit guidance, verification prompt, guest-facing deposit instructions. |
| All other locale files (8 files) | Add translated deposit keys. |

### Notification Flow (uses existing system)

When staff records a deposit and confirms:
1. Payment is recorded (existing `useCreatePayment`)
2. State transitions to `confirmed` (existing `useTransitionBookingState`)
3. Guest receives notification: "Your deposit has been received and your booking is confirmed" (enhanced in the transition handler)
4. Admin/Manager receives notification: "Booking confirmed with deposit of $X via cash/card" (enhanced)

### Permission Enforcement

- Only Supervisor+ can record payments (existing `canRecordPayment`)
- Only Front Desk+ can transition states (existing `canTransitionState`)
- Guest sees deposit status but cannot record payments (existing RLS)
- All payment amounts visible only to Manager+ (existing `canViewPaymentAmounts`)

### No Changes To

- State machine transitions
- RLS policies
- Route structure
- AI layer
- Edge functions
- Navigation
- Role hierarchy

---

## Summary

This formalizes the in-person deposit workflow by:
1. Combining "record deposit" and "confirm booking" into one staff action
2. Showing guests clear deposit instructions and status
3. Adding a configurable deposit percentage policy
4. Improving payment method labels for operational clarity
5. Enhancing notifications with deposit-specific context

Everything stays within the existing architecture. No new states, no new tables, no new routes.
