
# Ground Stay -- Status Audit and Next Steps

## What is DONE (fully implemented)

| Layer | Status |
|-------|--------|
| Booking State Machine (9 states + logging) | Done |
| Unit Management (groups, photos, drag-reorder, active/inactive) | Done |
| RBAC (7 roles + permission checks) | Done |
| Policy Settings (buffer, deadlines, cancellation tiers) | Done |
| Pricing Engine (seasonal, weekend, overrides, cleaning fee) | Done |
| Calendar View (grid + maintenance blocks + hatched bars) | Done |
| Deposit Deadline Warnings (countdown badge + detail sheet banner) | Done |
| Soft Hold Expiration (countdown badge + detail sheet banner) | Done |
| Maintenance Blocks (DB table, CRUD hooks, dialog, calendar rendering) | Done |
| Cleaning Buffer Enforcement (hard block for non-admin, soft warning for admin) | Done |
| Maintenance Overlap Validation (prevents booking on blocked dates) | Done |
| Offline Payments (record payment with method, notes, audit) | Done |
| Guest Portal (bookings, listings, cancellation policy display) | Done |
| Embed Widgets (listing, compact, calendar, CTA via edge function) | Done |
| Phase 1 Reports (occupancy, revenue by unit, state distribution) | Done |
| Staff Messaging (internal notes + guest-visible toggle) | Done |

## What is PARTIALLY DONE

### 1. Reports -- Blocked vs Bookable missing maintenance blocks
The "Blocked vs Bookable Time" chart only counts booking-based blocks. Maintenance blocks from the `maintenance_blocks` table are not included, so units blocked for cleaning/renovation show as "Available" in reports.

### 2. Guest Portal -- no message display
Staff can send guest-visible messages, but the Guest Portal (`GuestPortal.tsx`) does not display them. Guests cannot see or reply to messages on their bookings.

### 3. Embed widget -- maintenance blocks not reflected
The `get-availability` edge function only checks bookings for blocked ranges. Maintenance blocks are not included, so embed calendars could show maintenance-blocked dates as available.

## What is NOT STARTED

### 4. ID Document Upload for Check-in
The constitution requires uploaded ID documents before check-in can be completed. No storage bucket or upload UI exists.

### 5. Automated Refund Calculation on Cancellation
Policy tiers exist (free/partial/no-refund) but when cancelling a booking, no refund amount is calculated or displayed to staff.

---

## Recommended Next Phase (3 items to build now)

These are small, high-impact fixes that close real gaps:

### Step 1: Guest Messaging in the Guest Portal
Add a "Messages" section to each booking card in the Guest Portal. Fetch non-internal messages for the guest's bookings and display them. Allow guests to reply (creates a non-internal message linked to the booking).

**Files changed:**
- `src/pages/GuestPortal.tsx` -- expand `GuestBookingCard` to show messages and a reply input
- No DB changes needed (RLS already allows guests to read non-internal messages on their own bookings)
- New RLS policy needed: allow guests to INSERT messages on their own bookings (with `is_internal = false`)

### Step 2: Include maintenance blocks in Reports
Update `useReports.ts` to fetch `maintenance_blocks` for the report month and count those days as "Maintenance" (a new category) in the Blocked vs Bookable chart. Update the bar chart to show a 4th stacked segment.

**Files changed:**
- `src/hooks/useReports.ts` -- add maintenance_blocks query, update blockedVsBookable calculation
- `src/pages/Reports.tsx` -- add "Maintenance" bar segment with distinct color

### Step 3: Include maintenance blocks in embed availability
Update the `get-availability` edge function to also query `maintenance_blocks` and merge those ranges into `blockedRanges` so embed calendars show accurate availability.

**Files changed:**
- `supabase/functions/get-availability/index.ts` -- query maintenance_blocks, merge into blockedRanges

---

## Technical Details

### Guest message INSERT policy (SQL migration)
A new RLS policy on `messages` allowing guests to insert messages on their own bookings with `is_internal = false` enforced.

### Reports maintenance integration
The `useReports` hook will fetch `maintenance_blocks` overlapping the report month, then for each unit-day, check if it falls within a maintenance block. This adds a "maintenance" count separate from "booked" and "blocked."

### Edge function update
The `get-availability` function will query `maintenance_blocks` for the requested unit (or all active units) with `end_date >= today`, and merge those date ranges into the `blockedRanges` array returned to embed widgets.
