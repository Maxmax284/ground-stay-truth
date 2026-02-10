

# Guest Portal Completeness + Account Lifecycle

## What's Missing

After reviewing the full codebase, here are the gaps:

### 1. New signups get stuck in "Pending Access"
The `handle_new_user()` database trigger only creates a profile row -- it does NOT assign the `guest` role in `user_roles`. So anyone who signs up via the Auth page (including from the embed "Book Now" CTA) sees the "Pending Access" screen and cannot reach the Guest Portal. This is the most critical blocker.

**Fix:** Update the `handle_new_user()` trigger to also insert a `guest` role into `user_roles` for every new signup. Staff accounts created via the admin edge function already get their role assigned separately, so this won't conflict -- the admin flow can upgrade the role after.

### 2. No account deletion
Guests currently have no way to delete their account. The Profile tab shows name/phone/email but no delete option. GDPR and general user respect require a "Delete my account" action.

**Fix:** Add a "Delete Account" button to the Profile tab (inside `ProfileEditor` or the Guest Portal profile section). This calls `supabase.rpc('delete_own_account')` -- a new database function (SECURITY DEFINER) that:
- Deletes the user's profile, roles, messages, documents, and bookings (or the cascade handles it)
- Calls `auth.admin_delete_user()` or simply deletes from `auth.users` (cascade handles the rest)
- Signs the user out client-side

Alternative: Use an edge function with the service role key to call `supabase.auth.admin.deleteUser(userId)` since deleting from `auth.users` directly requires admin privileges.

### 3. Embed widgets don't show a "Create Account" / "Sign Up" link
The listing, compact, and calendar embed types have no path to the Guest Portal. Only the CTA widget type supports a registration link. The other widget types should include a small "Create an account to book" link or a "Book Now" button that links to `/auth?register=true`.

**Fix:** Add an optional registration link/button to the FullListing and CompactCard embed widgets, pulling the same `contact_url` parameter. The EmbedCodeGenerator should also include the CTA target option for all widget types, not just the CTA type.

### 4. No "general inquiry" messaging
Currently, messages are tied to bookings. A guest with no bookings cannot send a message to staff. The Messages tab shows nothing if there are no booking threads.

**Fix:** Add a "New Message" / "Contact Us" button in the Messages tab that creates a message without a booking association -- or creates a lightweight "general inquiry" booking placeholder. Given the current schema ties messages to `booking_id`, the simpler approach is to allow guests to send a message that automatically creates an `inquiry` booking (or a dedicated "general" thread). For now, we'll add a "Send a message" prompt that guides guests to create a booking request first, keeping the data model clean.

### 5. Booking cancellation by guests
Guests can see their bookings but cannot cancel them. The booking state machine supports cancellation, but there's no cancel button in the guest booking cards.

**Fix:** Add a "Cancel Booking" button on guest booking cards for eligible states (inquiry, soft_hold, pending_approval, pending_deposit, confirmed). This transitions the booking to `cancelled` state and follows the existing refund calculation logic to show the guest what refund tier applies before confirming.

---

## Implementation Plan

### Database Changes

**Migration 1 -- Auto-assign guest role on signup:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'guest');

  RETURN NEW;
END;
$$;
```

**Migration 2 -- Account deletion function (or handled via edge function instead):**
An edge function `delete-account` will use the service role key to call `supabase.auth.admin.deleteUser(userId)`. The cascade on `auth.users` handles cleanup of profiles, roles, etc.

### Edge Function

**`supabase/functions/delete-account/index.ts`:**
- Validates the requesting user's JWT matches the account being deleted
- Calls `supabase.auth.admin.deleteUser(userId)` with the service role key
- Returns success

### Frontend Changes

| File | Change |
|------|--------|
| `src/pages/GuestPortal.tsx` | Add cancel booking button to `GuestBookingCard`; add "Contact us" guidance in empty Messages tab |
| `src/components/ProfileEditor.tsx` | Add "Delete Account" section with confirmation dialog |
| `src/pages/EmbedWidget.tsx` | Add optional "Book Now" link to FullListing and CompactCard widgets |
| `src/components/EmbedCodeGenerator.tsx` | Show CTA target option for all widget types, not just CTA |
| `src/i18n/locales/en.json` | Add translation keys for cancellation, account deletion, embed registration links |

### Booking Cancellation Flow (Guest Side)

- "Cancel Booking" button visible on cards with state: inquiry, soft_hold, pending_approval, pending_deposit, confirmed
- Clicking opens a confirmation dialog showing:
  - The refund tier (full / partial / no refund) based on `refundCalculator.ts`
  - A confirm/cancel action pair
- On confirm: calls a mutation that updates booking state to `cancelled` and logs it in `booking_state_log`

### Execution Order

1. Database migration: auto-assign `guest` role on signup
2. Edge function: `delete-account`
3. Profile editor: add delete account button + confirmation
4. Guest booking cards: add cancel booking button + confirmation dialog
5. Embed widgets: add registration links to listing/compact types
6. Embed code generator: expose CTA target for all widget types
7. Translation keys for all new strings
