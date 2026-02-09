

# Ground Stay -- Remaining Work (Gap Analysis and Implementation Plan)

## What's Already Done

- Database schema: all 9 tables, RLS policies, booking overlap trigger, policy defaults seeded
- Authentication: email/password login/signup, role checking, protected routes
- Units: full CRUD with cards, edit dialog, active/inactive toggle
- App shell: sidebar navigation, warm design system, dashboard layout

## What's Still Needed

The remaining work falls into 5 major feature areas, each currently a stub page. Given the scope, I recommend building them in this order -- each phase is independently useful.

---

## Phase 1: Booking Management (the core of the system)

This is the most critical piece -- the booking state machine is the heart of Ground Stay.

**New files and hooks:**
- `src/hooks/useBookings.ts` -- CRUD + state transition logic with audit logging
- `src/hooks/useProfiles.ts` -- fetch guest profiles for booking display
- `src/components/BookingFormDialog.tsx` -- create/edit booking (select unit, guest, dates, num_guests, notes)
- `src/components/BookingDetailSheet.tsx` -- slide-out detail view with state history, pricing breakdown, messages, payments
- `src/components/BookingStateTransition.tsx` -- state machine controls showing only valid next states, with required reason field
- `src/components/BookingFilters.tsx` -- filter by state, unit, date range

**Booking state machine rules (enforced in UI):**
- Valid transitions defined in a constant map (e.g., inquiry can go to soft_hold or cancelled)
- Admin override allows skipping states with mandatory reason
- Every transition writes to `booking_state_log` with from_state, to_state, changed_by, reason
- UI hides invalid transitions entirely (per constitution: "hide actions users cannot perform")

**Bookings page (`src/pages/Bookings.tsx`):**
- Table/list view with columns: unit name, guest, check-in/out, state badge, created date
- Filters bar (state, unit, date range)
- Click row to open detail sheet
- "New Booking" button opens form dialog

**Payments section (within booking detail):**
- Record offline payment (amount, method, notes)
- Payment list per booking
- No amounts visible to non-admin roles (V1 is admin-only so this is just architectural prep)

**Messages section (within booking detail):**
- Internal notes per booking
- Mark as internal vs guest-visible
- System messages clearly labeled

---

## Phase 2: Calendar View

**New files:**
- `src/pages/CalendarView.tsx` -- full rewrite of the stub
- `src/components/CalendarGrid.tsx` -- multi-unit timeline grid (units as rows, dates as columns)
- `src/components/CalendarLegend.tsx` -- color key for states

**Behavior:**
- Horizontal scrolling timeline, 30-day default view with navigation
- Each unit is a row; bookings rendered as colored bars spanning check-in to check-out
- Color coding per state (inquiry = light, soft_hold = amber, confirmed = green, checked_in = blue, etc.)
- Cleaning buffer shown as hatched/striped blocks after checkout
- Click empty date range to open new booking form pre-filled with unit and dates
- No overlapping bookings enforced visually and at database level (already done)
- Guest-facing meaning: blocked dates show as "Unavailable" (prep for future embed)

---

## Phase 3: Pricing and Policies

**Pricing page (`src/pages/Pricing.tsx`):**
- Per-unit pricing summary cards showing base price, weekend price
- Seasonal pricing rules: add/edit/delete rules per unit (name, date range, price)
- `src/hooks/usePricingRules.ts` -- CRUD for pricing_rules table
- `src/components/PricingRuleForm.tsx` -- form for seasonal rules

**Policy settings section:**
- Display and edit all policy_settings from the database
- `src/hooks/usePolicySettings.ts` -- read/update for policy_settings table
- `src/components/PolicySettingsForm.tsx` -- form for each policy key with current value, description
- Changes logged (updated_by tracked in the table)

**Pricing priority display:**
- Show the priority order: Manual override > Seasonal > Weekend > Base
- Read-only explainer -- no forecasting

---

## Phase 4: Dashboard Home (live data)

**Update `src/pages/Index.tsx`:**
- Replace static cards with real queries:
  - Today's arrivals: bookings with check_in = today and state in (confirmed, pending_deposit)
  - Today's departures: bookings with check_out = today and state = checked_in
  - Active bookings: count of bookings in active states
  - Occupancy: (booked nights / total available nights) for current period
- Quick action cards linking to /units, /bookings, /calendar
- Recent activity: last 10 entries from booking_state_log with human-readable descriptions

---

## Phase 5: Reports

**Reports page (`src/pages/Reports.tsx`):**
- `src/hooks/useReports.ts` -- aggregation queries
- Three report cards with recharts visualizations:
  1. **Occupancy rate**: bar chart per unit over selectable date range
  2. **Revenue per unit**: stacked bar chart over selectable date range
  3. **Blocked vs bookable time**: stacked bar showing maintenance, booked, and available
- Date range selector (last 30 days, last 90 days, custom)
- Descriptive only -- no forecasting or speculative analysis per constitution
- Warm color palette consistent with design system

---

## Phase 6: Settings

**Settings page (`src/pages/Settings.tsx`):**
- Profile management: edit own name, phone, avatar
- Policy settings editor (may share component with Pricing page)
- User/role management (admin-only): list users, assign roles
- This is lower priority since policies are also editable from the Pricing page

---

## Technical Notes

- All data hooks follow the existing pattern in `useUnits.ts` (React Query + Supabase client)
- No new database tables or migrations needed -- everything is already in place
- State machine transition map will be a shared constant used by both Bookings and Calendar
- Booking state log writes happen alongside state updates (in the same mutation function)
- The overlap trigger in the database provides the safety net; UI also prevents invalid date selection
- Cleaning buffer enforcement uses `policy_settings.cleaning_buffer_hours` value

## Recommended Build Order

Given scope, I recommend starting with **Phase 1 (Bookings)** as it is the operational core. Each phase after that builds on it. I would tackle them one phase per conversation to keep changes focused and testable.

