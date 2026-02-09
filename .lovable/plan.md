
# Phase 7: Constitution Gap Closure

All 6 planned phases are built. Comparing the constitution against what exists reveals several gaps. This plan addresses the most impactful ones in priority order.

---

## 1. Fix Role-Based Route Access

**Problem**: Every route currently requires `requireAdmin`, locking out all non-admin roles entirely. The constitution defines 7 roles with different access levels.

**Change**:
- Remove `requireAdmin` from routes that non-admin users should access (Dashboard, Calendar, Bookings read-only, Settings profile tab)
- Add a `requireAuth`-only mode (already supported by `ProtectedRoute` when `requireAdmin` is omitted)
- Keep Pricing, Reports, and Users/Roles as admin-only
- Settings page already conditionally hides admin tabs -- just needs the route unlocked

**Files**: `src/App.tsx`

---

## 2. Add "Blocked vs Bookable Time" Report

**Problem**: The constitution explicitly lists three Phase 1 reports: occupancy, revenue, and blocked vs bookable time. Only the first two exist.

**Change**:
- Add a stacked bar chart to Reports showing per-unit breakdown: Booked days, Maintenance/blocked days, and Available days for the selected month
- Update `useReports.ts` to compute available vs blocked vs booked per unit

**Files**: `src/hooks/useReports.ts`, `src/pages/Reports.tsx`

---

## 3. Guest Selection in Booking Form

**Problem**: The booking form has no way to associate a guest. The `guest_id` field exists in the database but is never populated from the UI.

**Change**:
- Add a guest selector (searchable dropdown) to `BookingFormDialog` that queries the `profiles` table
- Display guest name in the bookings table and booking detail sheet
- Show guest name on calendar tooltips

**Files**: `src/components/BookingFormDialog.tsx`, `src/pages/Bookings.tsx`, `src/components/BookingDetailSheet.tsx`

---

## 4. Soft Hold Expiration Warning

**Problem**: Constitution says soft holds expire after 12 hours. No enforcement or UI indication exists.

**Change**:
- Add a visual indicator on soft-hold bookings showing time remaining (or "expired" badge)
- Read `soft_hold_expiration_hours` from `policy_settings`
- Display a warning in the booking detail sheet when a soft hold has expired
- Note: actual auto-cancellation would require a backend cron job (out of scope for now), but the UI should clearly flag expired holds

**Files**: `src/components/BookingDetailSheet.tsx`, `src/pages/Bookings.tsx`

---

## 5. Display Guest Name Across the App

**Problem**: Bookings table, calendar tooltips, and dashboard activity feed don't show guest names -- only unit names.

**Change**:
- Update `useBookings` to join `profiles` via `guest_id` to fetch `full_name`
- Show guest name column in Bookings table
- Show guest name in calendar tooltips
- Show guest name in dashboard recent activity

**Files**: `src/hooks/useBookings.ts`, `src/pages/Bookings.tsx`, `src/components/CalendarGrid.tsx`, `src/hooks/useDashboard.ts`, `src/pages/Index.tsx`

---

## Technical Details

- Guest profile lookup uses the existing `profiles` table with RLS policy "Admins can read all profiles"
- The `useBookings` hook query changes from `.select("*, units(name)")` to `.select("*, units(name), profiles!guest_id(full_name, email)")`
- Soft hold expiration is computed client-side by comparing `created_at + policy hours` against `now()`
- The blocked vs bookable chart reuses the same bookings data already fetched by `useReports`, just adds a new derivation
- No database migrations needed -- all tables and columns already exist
