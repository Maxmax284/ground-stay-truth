

# Comprehensive Role Enforcement and Constitution Compliance Fix

## Problems Found

### 1. Route Protection is Broken (Critical)
Routes in `App.tsx` use only coarse guards (`staffOnly`, `requireAdmin`) that don't match the constitution:

| Route | Current Guard | Problem |
|-------|--------------|---------|
| `/units` | `requireAdmin` | Blocks Managers (constitution says Manager+) |
| `/pricing` | `requireAdmin` | Blocks Managers (constitution says Manager+) |
| `/reports` | `requireAdmin` | Blocks Managers and Viewers (constitution says Manager, Admin, Viewer) |
| `/bookings` | `staffOnly` | Lets maintenance and viewer roles in (viewer is read-only, which is fine, but maintenance shouldn't access bookings) |
| `/dashboard` | `staffOnly` | Allows null-role users through (any authenticated non-guest passes) |
| `/settings` | `staffOnly` | Lets maintenance in (they shouldn't access settings) |

A user with no role assigned (null) bypasses the `staffOnly` guard because it only blocks `role === "guest"`. They get full staff access.

### 2. No "Pending Access" Screen for New Users
When someone signs up, they have no role. Currently they land on the dashboard with full staff access. The constitution requires named accounts with explicit role assignment.

### 3. UserRoleManager Requires Raw UUIDs
The admin role management UI forces pasting raw user UUIDs -- unusable on mobile and impractical in general. Admins need to search by name or email.

### 4. Dashboard Quick Actions Ignore Roles
The dashboard shows "Manage Units", "Pricing & Policies" links to all staff, even front desk users who can't access those pages.

### 5. Front Desk Payment Visibility Not Fully Enforced
The bookings table shows `total_price` to everyone. Constitution says front desk sees "Paid / Unpaid / Offline Recorded only" with no amounts.

---

## Plan

### Step 1: Refactor ProtectedRoute to use canAccessRoute

Replace the coarse `staffOnly` / `requireAdmin` props with a `requiredPath` prop that delegates to the existing `canAccessRoute()` function in `permissions.ts`.

Add handling for `role === null` (authenticated but no role assigned): show a "Pending Access" screen explaining that an administrator needs to assign their role.

**File: `src/components/ProtectedRoute.tsx`**

### Step 2: Update App.tsx Route Definitions

Replace all `staffOnly` and `requireAdmin` props with the appropriate route path so `canAccessRoute` handles enforcement.

**File: `src/App.tsx`**

| Route | New Guard |
|-------|-----------|
| `/dashboard` | `requiredPath="/dashboard"` |
| `/units` | `requiredPath="/units"` |
| `/bookings` | `requiredPath="/bookings"` |
| `/calendar` | `requiredPath="/calendar"` |
| `/pricing` | `requiredPath="/pricing"` |
| `/reports` | `requiredPath="/reports"` |
| `/settings` | `requiredPath="/settings"` |
| `/guest` | `guestOnly` (kept as-is) |

### Step 3: Improve UserRoleManager with User Search

Replace the raw UUID input with a search-by-name-or-email field. Query the `profiles` table with an `ilike` filter and show results in a dropdown. Keep UUID fallback for advanced use.

Only admins can see the Users and Roles tab (already enforced by `canManageRoles` check in Settings page + RLS policy on `user_roles`).

**File: `src/components/UserRoleManager.tsx`**

### Step 4: Filter Dashboard Quick Actions by Role

Update `src/pages/Index.tsx` to only show quick action links the user's role can actually access (using `canAccessRoute`).

**File: `src/pages/Index.tsx`**

### Step 5: Hide Payment Amounts from Front Desk in Bookings Table

In `src/pages/Bookings.tsx`, the table currently doesn't show amounts (it shows unit, guest, dates, guests, state, created). This is already compliant. No change needed here.

However, in `BookingDetailSheet.tsx`, payment amounts are already gated by `canViewPaymentAmounts` and `canRecordPayment`. This is correct.

The `total_price` shown in GuestPortal is for the guest's own booking -- this is allowed by the constitution ("Transparent pricing breakdown").

---

## What's Already Correct (No Changes Needed)

- RLS on `user_roles`: Only admins can INSERT/UPDATE/DELETE (confirmed via database policy)
- Settings page: Users and Roles tab only visible to admins (`canManageRoles`)
- Policies tab: Only visible to admins (`canManagePolicies`)
- Sidebar navigation: Already filters by `canAccessRoute`
- State transitions: Already filtered by role (check-in requires supervisor+, override requires admin)
- Payment visibility: Already gated by `canViewPaymentAmounts` in BookingDetailSheet
- Document upload: Gated by `canUploadDocuments` (front desk+)
- Booking creation: Gated by `canCreateBooking` (front desk+)
- Messaging: Gated by `canSendMessages` (front desk+)
- Guest portal: Properly isolated with `guestOnly` guard

---

## Summary of Files Changed

| File | What Changes |
|------|-------------|
| `src/components/ProtectedRoute.tsx` | Add `requiredPath` prop, use `canAccessRoute`, add "Pending Access" screen for null-role users |
| `src/App.tsx` | Replace `staffOnly`/`requireAdmin` with `requiredPath` on each route |
| `src/components/UserRoleManager.tsx` | Add profile search by name/email instead of UUID-only input |
| `src/pages/Index.tsx` | Filter quick action links by user's role using `canAccessRoute` |

No database changes needed. RLS policies are already correct.
