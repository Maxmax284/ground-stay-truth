

# Fix Unit Deletion Foreign Key Error + Unit Integrity Review

## The Problem

When you click "Remove" on a unit that has any bookings, maintenance requests, or laundry requests linked to it, the database correctly refuses to delete it (foreign key constraint). But the app just shows a raw error toast instead of handling this gracefully.

## The Solution

**Do NOT change the foreign key constraints.** Deleting a unit should never cascade-delete its bookings -- that would destroy financial and operational records. Instead, fix the application layer to handle this properly.

---

## Changes

### 1. Smart Deletion Logic in `src/hooks/useUnits.ts`

Update `useDeleteUnit` to check for linked records before attempting deletion:

- Query `bookings`, `maintenance_requests`, and `laundry_requests` for the unit ID
- If any linked records exist, throw a descriptive error explaining the unit cannot be removed and should be deactivated instead
- If no linked records, proceed with deletion (pricing rules and maintenance blocks already cascade-delete automatically)

### 2. Better UX in `src/pages/Units.tsx`

Update the `handleDelete` function:

- Replace the browser `confirm()` dialog with a smarter flow
- Before showing the confirmation, check if the unit has linked bookings
- If it does: show a toast explaining the unit has booking history and should be deactivated instead, with no delete attempt
- If it doesn't: show the standard confirmation and proceed with deletion
- This prevents the user from ever seeing a raw database error

### 3. Translation Keys

Add to all 9 locale files:

```
"units.cannotRemove": "This unit has booking history and cannot be removed. Deactivate it instead to hide it from guests."
```

---

## What This Does NOT Change

- No database schema changes
- No foreign key modifications
- No changes to the booking state machine
- No changes to RLS policies
- No changes to the unit form, photo upload, or group management
- Deactivation continues to work as-is (sets `is_active = false`, hides from guests)

## Why Not CASCADE?

Cascade-deleting bookings when a unit is removed would destroy financial records, audit trails, guest history, and payment records. The `ON DELETE RESTRICT` constraint is correct -- it protects the system. The fix belongs in the application layer.

---

## Files Summary

| File | Action | Change |
|------|--------|--------|
| `src/hooks/useUnits.ts` | MODIFY | Add pre-deletion check for linked bookings/requests |
| `src/pages/Units.tsx` | MODIFY | Replace raw error handling with graceful "deactivate instead" guidance |
| All 9 locale files | MODIFY | Add `units.cannotRemove` translation key |
