
# Fix Critical RLS Gaps, Expand Notifications, and Add Message Read Tracking

This plan addresses three areas: fixing database security policies so staff can actually do their jobs, expanding maintenance notifications to include Front Desk and Supervisors, and adding proper read/unread tracking for messages.

---

## 1. Fix RLS Policy Gaps (Database Migration)

Currently, only Admin and Guest have explicit policies on several critical tables. Front Desk, Supervisor, and Manager roles are blocked from reading/writing data they need. Here are the missing policies:

### bookings table
- **Staff can read all bookings** (front_desk+): Currently only admins and guests (own) can read. Front Desk, Supervisors, Managers need SELECT access.
- **Staff can update bookings** (front_desk+): Needed for state transitions, updating notes, etc.

### booking_state_log table
- **Staff can read booking state logs** (front_desk+): Currently only admins can read. All staff need to see audit history.
- **Staff can insert booking state logs** (front_desk+): Needed when transitioning booking states.

### payments table
- **Supervisors+ can manage payments**: Currently only admins can access. Front Desk Supervisors and Managers need INSERT and SELECT.

### messages table
- **Staff can read all messages** (front_desk+): Currently only admins and guests (own, non-internal) can read.
- **Staff can send messages** (front_desk+): Currently only admins and guests can insert.

### profiles table
- **Staff can read profiles** (front_desk+): Staff need to look up guest names when viewing bookings, messages, etc.

### SQL Migration

```sql
-- bookings: staff can read
CREATE POLICY "Staff can read all bookings"
ON public.bookings FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- bookings: staff can update
CREATE POLICY "Staff can update bookings"
ON public.bookings FOR UPDATE
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- booking_state_log: staff can read
CREATE POLICY "Staff can read booking state logs"
ON public.booking_state_log FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- booking_state_log: staff can insert
CREATE POLICY "Staff can insert booking state logs"
ON public.booking_state_log FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'front_desk'::app_role));

-- payments: supervisor+ can read
CREATE POLICY "Supervisors can read payments"
ON public.payments FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk_supervisor'::app_role));

-- payments: supervisor+ can insert
CREATE POLICY "Supervisors can insert payments"
ON public.payments FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'front_desk_supervisor'::app_role));

-- messages: staff can read all messages
CREATE POLICY "Staff can read all messages"
ON public.messages FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- messages: staff can send messages
CREATE POLICY "Staff can send messages"
ON public.messages FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'front_desk'::app_role));

-- profiles: staff can read all profiles
CREATE POLICY "Staff can read all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- pricing_rules: manager+ can read
CREATE POLICY "Managers can read pricing rules"
ON public.pricing_rules FOR SELECT
USING (public.has_role(auth.uid(), 'manager'::app_role));

-- pricing_rules: manager+ can manage
CREATE POLICY "Managers can manage pricing rules"
ON public.pricing_rules FOR ALL
USING (public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));
```

Note: The `has_role` function uses the role hierarchy in the `user_roles` table. Because these policies check for a minimum role (e.g., `front_desk`), and higher roles like `manager` and `admin` already have their own ALL policies, this layering works correctly. The `has_role` function checks for an exact role match, so `front_desk` policy won't automatically cover `manager` -- but managers already have coverage through the admin/manager ALL policies.

---

## 2. Expand Maintenance Notification Coverage

### File: `src/hooks/useMaintenanceRequests.ts`

In `useCreateMaintenanceRequest` (line 132), the notification query currently only targets `admin`, `manager`, and `maintenance` roles. Add `front_desk` and `front_desk_supervisor` to the list so they also receive alerts when guests submit new maintenance requests.

Change:
```typescript
.in("role", ["admin", "manager", "maintenance"])
```
To:
```typescript
.in("role", ["admin", "manager", "maintenance", "front_desk", "front_desk_supervisor"])
```

---

## 3. Add Message Read Tracking

The current "unread" count is approximated by checking `sender_id !== user.id`, which inflates counts (every message from someone else is always "unread"). A proper solution needs a `read_at` field.

### Database: Add `read_at` column to messages

```sql
ALTER TABLE public.messages ADD COLUMN read_at timestamptz DEFAULT NULL;
```

### File: `src/hooks/useBookings.ts`

Add a new mutation `useMarkMessagesRead` that updates `read_at = now()` for all messages in a booking thread where `sender_id != user.id` and `read_at IS NULL`.

```typescript
export function useMarkMessagesRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .neq("sender_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: (_, bookingId) => {
      qc.invalidateQueries({ queryKey: ["bookingMessages", bookingId] });
      qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      qc.invalidateQueries({ queryKey: ["guest-messages"] });
    },
  });
}
```

### File: `src/pages/Messages.tsx`

Update `useInboxThreads` to calculate `unread_count` using `read_at IS NULL` instead of `sender_id !== user.id`:

```typescript
unread_count: msgs.filter((m) => m.sender_id !== user?.id && !m.read_at).length
```

Call `markRead.mutate(bookingId)` when a thread is opened (when `BookingDetailSheet` opens).

### File: `src/pages/GuestPortal.tsx`

Same change for the guest inbox threads -- use `read_at` instead of counting all non-self messages. Call `markRead` when guest opens a thread.

### File: `src/components/BookingDetailSheet.tsx`

When the messages tab is viewed, call `useMarkMessagesRead` to mark messages as read.

---

## Summary of Changes

| Item | Type | Description |
|------|------|-------------|
| Database migration | SQL | Add 11 RLS policies for staff access to bookings, state logs, payments, messages, profiles, pricing |
| Database migration | SQL | Add `read_at` column to messages table |
| `useMaintenanceRequests.ts` | Code | Add front_desk and front_desk_supervisor to notification targets |
| `useBookings.ts` | Code | Add `useMarkMessagesRead` mutation |
| `Messages.tsx` | Code | Use `read_at` for unread count + mark read on open |
| `GuestPortal.tsx` | Code | Use `read_at` for unread count + mark read on open |
| `BookingDetailSheet.tsx` | Code | Call mark-read when messages tab is viewed |

No new dependencies needed.
