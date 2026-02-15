

# Account Visibility & System Census Module

An administrative census layer added as a new tab inside the existing Reports page. Purely observational, governance-oriented, no marketing or outreach features.

---

## Architecture Overview

Since `auth.users` (which contains `last_sign_in_at` and `created_at`) is not accessible from the client-side Supabase SDK, we need a backend function to compile the census data. The function will enforce role-based access, returning different levels of detail depending on the caller's role.

---

## 1. Database Changes

**Add `last_sign_in_at` to profiles table** via a trigger that updates it on every login. This avoids querying `auth.users` directly.

```sql
-- Add last_sign_in_at column to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- Trigger function to sync last_sign_in_at from auth
CREATE OR REPLACE FUNCTION public.sync_last_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles 
  SET last_sign_in_at = NEW.last_sign_in_at 
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users (fires on login)
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_last_sign_in();
```

**Note:** The trigger on `auth.users` is acceptable here because it's a `SECURITY DEFINER` function updating a `public` table -- it doesn't modify the auth schema itself.

**Seed existing data** by backfilling from `auth.users`:

```sql
UPDATE public.profiles p
SET last_sign_in_at = u.last_sign_in_at
FROM auth.users u
WHERE p.user_id = u.id;
```

No new tables. No views. The existing `profiles`, `user_roles`, and `bookings` tables provide everything else.

---

## 2. Backend Function

**New Edge Function: `account-census`**

`supabase/functions/account-census/index.ts`

This function:
- Authenticates the caller and checks their role
- Queries `profiles`, `user_roles`, and `bookings` using the service role key
- Returns tiered data based on caller's role:

| Caller Role | Data Returned |
|------------|---------------|
| **Viewer** | Aggregate counts only (total accounts, total guests, total staff, total admin, active/dormant counts) |
| **Manager** | Everything Viewer gets + role distribution breakdown + activity breakdown (active vs dormant by category) |
| **Admin** | Everything Manager gets + detailed account table (name, email, role, last login, booking counts, created date) |
| Others | 403 Forbidden |

The function handles all computation server-side. No sensitive data leaks to unauthorized roles.

---

## 3. Frontend: New Hook

**`src/hooks/useAccountOverview.ts`**

Calls the `account-census` Edge Function. Returns typed data shaped for the UI components. Uses `@tanstack/react-query` with a `queryKey` of `["account-overview"]`.

---

## 4. Frontend: New Components

All placed in `src/components/reports/`:

| Component | Purpose | Visible To |
|-----------|---------|-----------|
| `AccountSnapshotCards.tsx` | Grid of stat cards (Total Accounts, Total Guests, Total Staff, Total Admins, Active, Dormant, With Active Bookings, With History, Zero Activity) | Viewer, Manager, Admin |
| `AccountRoleChart.tsx` | Pie chart showing role distribution using recharts (same library and styling as existing charts) | Manager, Admin |
| `AccountActivityChart.tsx` | Bar chart showing Active vs Dormant breakdown by guest/staff categories | Manager, Admin |
| `AccountDetailTable.tsx` | Sortable table with name, email, role, last login, active booking status, total bookings, created date. No action buttons. | Admin only |

---

## 5. Reports Page Integration

**Modify `src/pages/Reports.tsx`:**

- Add Tabs component (from existing `@radix-ui/react-tabs`) wrapping the current content
- Tab 1: **Operations** (current reports content, unchanged)
- Tab 2: **Accounts** (new census module)
- The Accounts tab only renders if the user's role is Viewer, Manager, or Admin
- If the census data fails to load, show a non-blocking error card without affecting the Operations tab

The month navigation controls stay scoped to the Operations tab only.

---

## 6. i18n

Add translation keys under `reports.accounts` in all 9 locale files:

```json
"accounts": {
  "tabLabel": "Accounts",
  "operationsTab": "Operations",
  "totalAccounts": "Total Accounts",
  "totalGuests": "Total Guests",
  "totalStaff": "Total Staff",
  "totalAdmins": "Admin-Level Users",
  "activeAccounts": "Active Accounts",
  "dormantAccounts": "Dormant Accounts",
  "activeBookings": "With Active Bookings",
  "bookingHistory": "With Booking History",
  "zeroActivity": "Zero Activity",
  "roleDistribution": "Role Distribution",
  "activityBreakdown": "Account Activity",
  "detailTable": "Account Details",
  "name": "Name",
  "email": "Email",
  "role": "Role",
  "lastLogin": "Last Login",
  "hasActiveBooking": "Active Booking",
  "totalBookings": "Total Bookings",
  "createdDate": "Created",
  "active": "Active (90 days)",
  "dormant": "Dormant (90+ days)",
  "loadError": "Unable to load account data."
}
```

---

## 7. Permission Enforcement

**UI level** (in `Reports.tsx`): The Accounts tab is conditionally rendered based on the role from `useAuth()`. Only `viewer`, `manager`, and `admin` see the tab.

**Backend level** (in Edge Function): The function checks the caller's role via the `has_role` database function and returns 403 for unauthorized roles. Even if someone crafts a direct API call, they get nothing.

**Component level**: `AccountDetailTable` checks `role === "admin"` before rendering. `AccountRoleChart` and `AccountActivityChart` check `role !== "viewer"`.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| Migration SQL | CREATE | Add `last_sign_in_at` column + trigger |
| `supabase/functions/account-census/index.ts` | CREATE | Backend census computation with role gating |
| `src/hooks/useAccountOverview.ts` | CREATE | Hook calling the Edge Function |
| `src/components/reports/AccountSnapshotCards.tsx` | CREATE | Stat cards grid |
| `src/components/reports/AccountRoleChart.tsx` | CREATE | Role distribution pie chart |
| `src/components/reports/AccountActivityChart.tsx` | CREATE | Active vs dormant bar chart |
| `src/components/reports/AccountDetailTable.tsx` | CREATE | Admin-only sortable table |
| `src/pages/Reports.tsx` | MODIFY | Add tabs structure with Accounts tab |
| `src/i18n/locales/*.json` (all 9 files) | MODIFY | Add accounts translation keys |

No changes to routing, navigation, permissions file, or existing report logic.

