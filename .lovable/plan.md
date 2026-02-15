

# Deposit Control System — Context-Based, Admin-Governed, State-Aware

An architectural enhancement to the existing deposit workflow that makes deposit behavior configurable via policy toggles, transparent across all layers, and reversible without code changes.

---

## Current State Analysis

**What works today:**
- Manual deposit recording (cash/card/bank_transfer) is integrated into the `pending_deposit` to `confirmed` transition via an inline form in `BookingStateTransition.tsx`
- `deposit_percentage` policy setting exists (currently 100%)
- Guest portal shows a deposit info banner with amount and in-person instructions
- Notifications fire to guests and admins when deposits are recorded
- AI pre-flight validation runs on state transitions
- All payments are audit-logged with `recorded_by` and `booking_id`

**What's missing:**
- No concept of online deposits
- No toggles to control deposit behavior
- No way to require online payment vs allow manual
- No Manager override path when online is required
- No `source_channel` tracking on payments (where was it recorded: guest portal vs front desk vs override)
- AI has no awareness of deposit policy configuration
- Policy changes happen silently -- no notifications when toggles change

---

## Phase 1 -- Database Changes

### New Policy Settings (data insert, no schema change)

Insert three new rows into `policy_settings`:

| Key | Default | Description |
|-----|---------|-------------|
| `deposits_online_enabled` | `false` | Whether guests can pay deposits online |
| `deposits_manual_enabled` | `true` | Whether staff can record manual deposits (cash/card) |
| `deposits_require_online_when_enabled` | `false` | When online is enabled, whether it's required (vs optional) |

### Payments Table Enhancement (migration)

Add `source_channel` column to `payments`:

```sql
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS source_channel text 
  NOT NULL DEFAULT 'front_desk';
```

Valid values: `front_desk`, `guest_portal`, `supervisor_override`

This tracks WHERE the payment was recorded, not just by whom.

---

## Phase 2 -- Central Deposit Policy Helper

**New file: `src/lib/depositPolicy.ts`**

A single function `getDepositPolicy(policies)` that reads the three toggles from policy settings and returns the effective behavior:

```text
{
  onlineEnabled: boolean
  manualEnabled: boolean
  requireOnline: boolean
  effectiveMode: 'manual_only' | 'online_optional' | 'online_required'
}
```

Every component reads deposit behavior from this helper. No hardcoded logic anywhere.

---

## Phase 3 -- Behavior Matrix Implementation

### Case A: `deposits_online_enabled = false` (default, current behavior)

- Guest sees "Pay in person at front desk" banner (unchanged)
- Staff records deposit manually via inline form (unchanged)
- No online payment option shown anywhere

### Case B: `deposits_online_enabled = true`, `require = false`

- Guest sees BOTH options: "Pay online" button AND "Pay in person" instructions
- Staff can still record manual payments
- Either path moves booking to confirmed
- Online payment placeholder shown (no actual payment gateway yet -- shows "Online payments coming soon" or connects to future integration)

### Case C: `deposits_online_enabled = true`, `require = true`

- Guest sees "Online deposit required" messaging
- Staff inline deposit form is hidden by default
- Manager+ can override: a "Manager Override" toggle appears (similar to admin override pattern)
- Override requires a logged reason
- Override writes to `booking_state_log` with `[MANAGER DEPOSIT OVERRIDE]` prefix
- Override triggers notification to admins
- Payment recorded with `source_channel = 'supervisor_override'`

---

## Phase 4 -- File Changes

### Modified Files

| File | Change |
|------|--------|
| `src/components/BookingStateTransition.tsx` | Read deposit policy via helper. In Case C, hide manual form unless Manager override toggle is active. Add override reason requirement. Set `source_channel` on payment creation. |
| `src/components/BookingDetailSheet.tsx` | Pass `source_channel` display in payments list (admin/manager view). Update payment method labels. |
| `src/pages/GuestPortal.tsx` | Read deposit policy. Show appropriate banner per case: in-person only, both options, or online required. |
| `src/components/PolicySettingsForm.tsx` | Add the 3 new deposit keys to `BOOLEAN_KEYS` set so they render as switches. |
| `src/hooks/useBookings.ts` | Update `useCreatePayment` to accept `source_channel` parameter. Add notification when policy toggle changes result in different behavior. |
| `src/hooks/usePolicySettings.ts` | No structural changes needed -- the existing hook already fetches all policy settings. |
| `supabase/functions/ai-assistant/index.ts` | Include deposit policy state in the PROPERTY SNAPSHOT so AI can reference it in validate/digest/explain modes. |
| All 9 locale files | Add translation keys for online deposit messaging, override prompts, and policy descriptions. |

### New Files

| File | Purpose |
|------|---------|
| `src/lib/depositPolicy.ts` | Central helper that computes effective deposit behavior from policy settings. Single source of truth for all components. |

---

## Phase 5 -- AI Integration

Update the `ai-assistant` edge function to:

1. Fetch the 3 deposit policy values alongside existing policy queries
2. Include in PROPERTY SNAPSHOT: `Deposit policy: [manual_only|online_optional|online_required]. Manual deposits: [enabled|disabled]. Online deposits: [enabled|disabled].`
3. In `validate` mode: warn if staff tries to confirm without deposit when online is required and no override is present
4. In `digest` mode: include pending deposit count and current policy mode
5. In `explain` mode: clarify why a booking can't move forward based on active policy

AI remains advisory only. It never records payments or changes state.

---

## Phase 6 -- Notification Enhancements

| Trigger | Recipients | Message |
|---------|-----------|---------|
| Manager override used on deposit | All admins | "Booking [X] confirmed via manager deposit override by [name]. Reason: [reason]" |
| Deposit policy toggle changed | All admins/managers | "Deposit policy updated: [key] changed to [value] by [name]" |
| Online deposit recorded (future) | Guest + admins | "Online deposit of $X received for booking [Y]" |

Policy toggle change notifications are implemented in `useUpdatePolicySetting` -- when the key starts with `deposits_`, fire a notification to admin/manager roles.

---

## Phase 7 -- Security

- Only Admin can modify deposit policy settings (existing RLS on `policy_settings` already enforces this)
- Manager+ can use deposit override (new permission check in `permissions.ts`: `canOverrideDeposit`)
- `source_channel` is set server-side based on context, not user input
- All overrides logged to `booking_state_log` with explicit prefix
- No client-side bypass possible -- the transition handler validates policy before executing

### New Permission

Add to `src/lib/permissions.ts`:

```
canOverrideDeposit: (role) => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager
```

---

## Phase 8 -- No Silent Behavior Shifts

When a deposit policy toggle changes:

1. **State machine**: `BookingStateTransition` reads policy on every render (already reactive via `usePolicySettings`)
2. **AI**: Next AI call includes updated policy in snapshot (fetched fresh each call)
3. **Notifications**: Toggle change fires notification to admin/manager
4. **Staff dashboard**: Deposit form visibility updates immediately (React Query invalidation)
5. **Guest portal**: Deposit banner messaging updates on next page load (policy fetched via `usePolicySettings`)

No cached behavior. No stale state. Everything reads from the live policy.

---

## Rollout Order

1. Database migration (add `source_channel` column)
2. Insert 3 new policy setting rows
3. Create `src/lib/depositPolicy.ts` helper
4. Add `canOverrideDeposit` permission
5. Update `PolicySettingsForm.tsx` (add boolean keys)
6. Update `BookingStateTransition.tsx` (policy-aware deposit flow)
7. Update `GuestPortal.tsx` (context-aware deposit banner)
8. Update `useBookings.ts` (source_channel + policy change notifications)
9. Update `BookingDetailSheet.tsx` (source_channel display)
10. Update `ai-assistant` edge function (deposit policy in snapshot)
11. Add translation keys to all 9 locales
12. Deploy edge function

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Online payment gateway not yet integrated | "Online" mode shows instructional UI only. No actual payment processing until a gateway is connected. System is ready for it without depending on it. |
| Policy changed mid-booking | Bookings already in `pending_deposit` see updated messaging immediately. No bookings get stuck -- manual override always available to Manager+. |
| Toggle confusion | Policy descriptions are written in plain language. AI can explain current policy in "explain" mode. |
| Source channel not set on old payments | Default value `'front_desk'` covers existing records. No data migration needed. |

