

# Next Phase: Deposit Deadlines + Maintenance Blocks + Cleaning Buffer Enforcement

Three features that directly close gaps in the Ground Stay constitution, prioritized by operational impact.

---

## 1. Deposit Deadline Warnings

**What it does:** Shows a countdown badge on bookings in `pending_deposit` state, warning staff when the 24-hour deposit deadline is approaching or has expired -- exactly like the existing `SoftHoldBadge` pattern.

**Changes:**

### `src/pages/Bookings.tsx`
- Rename `SoftHoldBadge` to `BookingStatusBadge` and extend it to handle both `soft_hold` (existing) and `pending_deposit` states
- For `pending_deposit`: calculate elapsed time since the booking entered that state (using the `booking_state_log` transition timestamp, or falling back to `updated_at`)
- Show "Xh left" or "Expired" badge, matching the existing soft hold pattern
- Use the `deposit_deadline_hours` policy setting (default: 24h)

### `src/components/BookingDetailSheet.tsx`
- Add a `depositDeadlineInfo` block (mirroring the existing `softHoldInfo`) that shows a warning banner when the booking is in `pending_deposit`
- Message: "Deposit deadline in X hours" or "Deposit deadline has passed -- cancel or record payment"

### `src/hooks/useBookings.ts`
- Update the `useBookings` query to also fetch the most recent state log entry per booking (specifically the `pending_deposit` transition timestamp) so we can calculate deadlines accurately
- Alternative simpler approach: use `booking.updated_at` as the timestamp for when it entered `pending_deposit` (already available, no extra query needed)

We will use the simpler approach (`updated_at`) to avoid query complexity. This is accurate because `updated_at` is set on every state change.

---

## 2. Maintenance/Housekeeping Blocks

**What it does:** Lets Admin/Manager block specific units for date ranges (maintenance, deep cleaning, renovation) with a reason. These blocks appear on the calendar with a distinct hatched pattern and prevent bookings during those dates.

**Changes:**

### Database Migration
- Create a `maintenance_blocks` table:
  - `id` (uuid, primary key)
  - `unit_id` (uuid, references units)
  - `start_date` (date)
  - `end_date` (date)
  - `reason` (text)
  - `created_by` (uuid)
  - `created_at` (timestamptz)
- RLS: Admin/Manager can manage; staff can read

### `src/hooks/useMaintenanceBlocks.ts` (new file)
- `useMaintenanceBlocks(filters?)` -- fetch blocks, optionally filtered by date range or unit
- `useCreateMaintenanceBlock()` -- create a new block
- `useDeleteMaintenanceBlock()` -- remove a block

### `src/components/MaintenanceBlockDialog.tsx` (new file)
- Simple form: select unit, start date, end date, reason
- Used from the Calendar page (and optionally from Units page)

### `src/components/CalendarGrid.tsx`
- Render maintenance blocks as a distinct bar (e.g., red hatched pattern) on the calendar grid
- Show tooltip with "Maintenance: [reason]"
- Accept a new `maintenanceBlocks` prop

### `src/pages/CalendarView.tsx`
- Fetch maintenance blocks for the visible date range
- Pass them to `CalendarGrid`
- Add a "Block Dates" button (visible to Manager/Admin) that opens `MaintenanceBlockDialog`
- Add maintenance blocks to the `CalendarLegend`

### `src/components/BookingFormDialog.tsx`
- When creating a booking, check if the selected dates overlap with any maintenance block for that unit
- Show a validation error if they do: "This unit is blocked for maintenance from X to Y"

### `src/lib/permissions.ts`
- Add `canManageMaintenanceBlocks` -- Manager+ only

---

## 3. Cleaning Buffer Enforcement on Booking Creation

**What it does:** When creating a booking, check whether the selected check-in date falls within the cleaning buffer window of an existing booking's check-out. Currently the buffer is only visual on the calendar -- this makes it a real validation.

**Changes:**

### `src/components/BookingFormDialog.tsx`
- After selecting unit + dates, query existing bookings for that unit
- Check if the new check-in falls within `cleaning_buffer_hours` of any existing booking's check-out
- If so, show a validation warning: "Check-in conflicts with cleaning buffer -- earliest available check-in is [date/time]"
- This is a soft warning for Admin (who can override) and a hard block for other roles

---

## Summary of Files Touched

| File | Action |
|------|--------|
| `src/pages/Bookings.tsx` | Extend status badge for deposit deadlines |
| `src/components/BookingDetailSheet.tsx` | Add deposit deadline warning banner |
| `src/hooks/useMaintenanceBlocks.ts` | New hook for maintenance blocks |
| `src/components/MaintenanceBlockDialog.tsx` | New dialog for creating blocks |
| `src/components/CalendarGrid.tsx` | Render maintenance blocks on calendar |
| `src/pages/CalendarView.tsx` | Wire up maintenance blocks + "Block Dates" button |
| `src/components/CalendarLegend.tsx` | Add maintenance entry |
| `src/components/BookingFormDialog.tsx` | Add buffer + maintenance overlap validation |
| `src/lib/permissions.ts` | Add `canManageMaintenanceBlocks` |
| Database migration | Create `maintenance_blocks` table with RLS |

No changes to the booking state machine itself. No changes to pricing or auth. All three features follow existing patterns in the codebase.

