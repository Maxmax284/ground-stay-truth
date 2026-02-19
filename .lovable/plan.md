

# Harden Notification System -- Backend Function Migration

## Overview

Move all notification creation from client-side `createNotification()` calls to a new backend function (`create-notification`). Currently, the RLS policy on the `notifications` table allows any authenticated user to INSERT a notification targeting any `user_id`, which means a malicious guest could spoof notifications to other users. The fix moves the INSERT logic server-side where the service role key validates context before creating notifications.

## Security Problem

The current RLS policy on the `notifications` table:
```
Policy: "Authenticated users can insert notifications"
Command: INSERT
With Check: (auth.uid() IS NOT NULL)
```
This means **any logged-in user** (including guests) can insert a notification row with **any arbitrary `user_id`**, allowing spoofed notifications to staff or other guests.

## Solution

### 1. Create a new backend function: `create-notification`

A new edge function at `supabase/functions/create-notification/index.ts` that:
- Accepts an array of notification payloads: `{ notifications: [{ user_id, type, reference_id?, message }] }`
- Validates the caller's JWT via `getClaims()`
- Uses the **service role client** to insert notifications (bypassing RLS)
- Returns success/failure

This handles the batch pattern already used in the codebase (e.g., looping over admins to notify each one).

### 2. Tighten the RLS INSERT policy on `notifications`

Replace the current permissive INSERT policy:
```sql
-- Remove: any authenticated user can insert
DROP POLICY "Authenticated users can insert notifications" ON notifications;

-- Add: only service role (backend functions) can insert
-- No new INSERT policy needed -- the edge function uses service_role which bypasses RLS
```

With no INSERT policy for regular users, only the service role (used by the edge function) can create notifications. The existing SELECT and UPDATE policies remain unchanged (users can read/update their own).

### 3. Replace all client-side `createNotification()` calls

Update 4 files to call the edge function instead of inserting directly:

**`src/hooks/useNotifications.ts`** -- Replace the `createNotification` helper:
```typescript
export async function createNotification(params: {
  user_id: string;
  type: string;
  reference_id?: string;
  message: string;
}) {
  await supabase.functions.invoke("create-notification", {
    body: { notifications: [params] },
  });
}

// New batch helper for multi-recipient notifications
export async function createNotifications(
  notifications: Array<{ user_id: string; type: string; reference_id?: string; message: string }>
) {
  if (notifications.length === 0) return;
  await supabase.functions.invoke("create-notification", {
    body: { notifications },
  });
}
```

**`src/hooks/useBookings.ts`** -- Replace individual `createNotification` loops with batch `createNotifications` calls (reduces N+1 network requests to 1).

**`src/hooks/useMaintenanceRequests.ts`** -- Same batch refactor for staff/guest notifications.

**`src/hooks/useLaundryRequests.ts`** -- Same batch refactor for staff/guest notifications.

**`src/components/BookingStateTransition.tsx`** -- Same refactor for deposit override notifications.

### 4. Update `supabase/config.toml`

Add the new function config:
```toml
[functions.create-notification]
verify_jwt = false
```

### 5. Database migration

Drop the overly permissive INSERT policy:
```sql
DROP POLICY "Authenticated users can insert notifications" ON public.notifications;
```

No replacement INSERT policy is needed -- the edge function uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS entirely.

## Files to create
- `supabase/functions/create-notification/index.ts`

## Files to modify
- `src/hooks/useNotifications.ts` -- rewrite `createNotification` to call edge function, add `createNotifications` batch helper
- `src/hooks/useBookings.ts` -- switch to batch `createNotifications`
- `src/hooks/useMaintenanceRequests.ts` -- switch to batch `createNotifications`
- `src/hooks/useLaundryRequests.ts` -- switch to batch `createNotifications`
- `src/components/BookingStateTransition.tsx` -- switch to `createNotifications`

## Database migration
- Drop the `"Authenticated users can insert notifications"` INSERT policy

## What stays the same
- The `send-booking-confirmation` edge function already uses service role to insert notifications -- no change needed
- All SELECT/UPDATE RLS policies on notifications remain unchanged
- The `NotificationBell` component and realtime subscription are unaffected
- The notification data schema is unchanged

