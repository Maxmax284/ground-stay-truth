

# Admin Account Creation Feature

## What This Does

Adds the ability for Admins to create staff accounts directly from the Settings > Users & Roles tab -- complete with email, password, full name, and role assignment in one step. No email verification required for admin-created accounts (they're pre-trusted). The new staff member can log in immediately.

## How It Works

```text
Admin fills form --> Edge Function (server-side) --> Creates auth user + profile + role --> Done
```

The key constraint: creating users with passwords can only be done server-side using the service role key. So this requires a backend function that the admin calls from the UI.

## Implementation

### 1. Backend Function: `create-staff-account`

A new edge function at `supabase/functions/create-staff-account/index.ts` that:

- Validates the caller is an admin (checks their JWT against `user_roles`)
- Creates the auth user via `supabase.auth.admin.createUser()` with `email_confirm: true` (pre-verified)
- The existing database trigger (`handle_new_user`) auto-creates the profile
- Inserts the role into `user_roles`
- Returns the new user ID on success
- Input validation: email format, password min 6 chars, valid role enum, full name required

### 2. UI: "Create Staff Account" section in UserRoleManager

Add a collapsible section or dialog above the existing "Assign Role" form with:

- Full Name (required)
- Email (required)
- Password (required, min 6 characters)
- Role dropdown (same as existing, excludes `guest`)
- "Create Account" button
- Same supervisor cap enforcement (blocks if selecting supervisor and cap reached)
- Success feedback: "Account created. [Name] can now sign in with their credentials."

### 3. Files Changed

| File | Change |
|------|--------|
| `supabase/functions/create-staff-account/index.ts` | New edge function -- validates admin caller, creates user + role server-side |
| `src/components/UserRoleManager.tsx` | Add "Create Staff Account" form section with email/password/name/role fields |
| `src/hooks/useUserRoles.ts` | Add `createStaffAccount` mutation that calls the edge function |

### Security

- Edge function verifies the caller's JWT and confirms they have the `admin` role before proceeding
- Password is transmitted over HTTPS to the edge function, never stored client-side
- The service role key (already configured as a secret) is only used server-side
- Created accounts are immediately active -- no email verification step needed since an admin is vouching for them
- Input validated both client-side (form) and server-side (edge function)

