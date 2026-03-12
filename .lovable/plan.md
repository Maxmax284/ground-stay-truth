

# Plan: Close All Six Critical Platform Gaps

This plan addresses the six gaps identified in the previous analysis. Each gap becomes a discrete workstream, implemented cleanly into the existing architecture using `policy_settings`, RLS, and the established role hierarchy.

---

## Gap 1 — Housekeeping Task Management

**What it does:** Auto-generates cleaning/turnover tasks between checkout and the next check-in for each unit. Staff can be assigned, mark tasks complete, and Admins see completion status.

**Database changes:**
- New `housekeeping_tasks` table: `id`, `unit_id`, `booking_out_id` (departing), `booking_in_id` (arriving, nullable), `assigned_to` (nullable uuid), `status` (enum: pending, in_progress, completed, skipped), `due_by` (timestamptz), `completed_at`, `notes`, `created_at`, `updated_at`
- RLS: Admin full access, Manager can manage, Front Desk can read/update, Maintenance can read/update own assigned
- Database trigger on `bookings` table: when state changes to `completed` (checkout), auto-insert a `housekeeping_tasks` row for that unit, computing `due_by` from the next booking's check-in minus `cleaning_buffer_hours`

**Frontend changes:**
- New `useHousekeepingTasks` hook
- New `HousekeepingPanel` component (similar pattern to `MaintenanceQueue`)
- Add to Dashboard for Front Desk+ roles and Maintenance role
- Add to sidebar navigation under a new "Housekeeping" nav item (or integrate into Dashboard)

---

## Gap 2 — Security Deposit Lifecycle

**What it does:** Tracks damage/security deposits through a hold-inspect-release/deduct cycle separate from booking deposits.

**Database changes:**
- New `security_deposits` table: `id`, `booking_id`, `amount_held`, `amount_deducted`, `deduction_reason`, `status` (held, inspected, released, deducted), `held_at`, `inspected_by`, `inspected_at`, `released_at`, `released_by`, `notes`, `created_at`
- New policy settings: `security_deposit_amount` (default 0 = disabled), `security_deposit_required` (boolean)
- RLS: Admin full, Manager can update status, Supervisor can read, Guest can read own

**Frontend changes:**
- Add security deposit section to `BookingDetailSheet` visible when `security_deposit_amount > 0`
- Inspection form for Manager+ at checkout: release full, or deduct with reason
- Policy setting toggle in `PolicySettingsForm`
- Guest portal shows deposit status

---

## Gap 3 — Email Automation Sequences

**What it does:** Expands the existing `send-scheduled-emails` edge function with additional automated touchpoints.

**Edge function changes (send-scheduled-emails):**
- Add **deposit reminder** sequences: 12h and 24h after entering `pending_deposit` state (check `booking_state_log` timestamp)
- Add **welcome message** on check-in day for `checked_in` bookings
- All sequences respect `email_log` idempotency (already in place)

**New policy settings:**
- `email_deposit_reminder_enabled` (default true)
- `email_welcome_enabled` (default true)

**Frontend:** Add toggles to PolicySettingsForm for each email sequence.

---

## Gap 4 — Advanced Revenue Analytics (RevPAR, ADR, Forecasting)

**What it does:** Adds three KPI cards and a trend chart to the Reports page.

**Frontend changes (Reports.tsx + useReports.ts):**
- Compute **ADR** (Average Daily Rate): total revenue / total occupied nights
- Compute **RevPAR** (Revenue Per Available Room): total revenue / total available room-nights
- Compute **Occupancy Forecast**: simple 30-day forward projection based on confirmed + pending_deposit bookings vs total unit capacity
- New KPI cards row at top of Operations tab showing ADR, RevPAR, and forecast occupancy %
- Format all values using existing `getCurrencyConfig`

---

## Gap 5 — Financial Export (CSV/PDF Ledger)

**What it does:** Lets Admin/Manager download a monthly financial summary as CSV.

**Frontend changes:**
- New "Export" button on Reports Operations tab
- CSV export function that compiles: booking ID, unit name, guest name, check-in, check-out, total price, payments received, state, date
- Uses existing `bookings` + `payments` data already fetched by `useReports`
- PDF generation via browser print (no new dependency needed) or simple CSV download

**No database changes required** — reads existing data.

---

## Gap 6 — Training Program Integration

**What it does:** Links accommodation bookings to Muay Thai training packages so staff can see which guests are training and their schedule.

**Database changes:**
- New `training_packages` table: `id`, `name`, `description`, `duration_days`, `price`, `is_active`, `created_at`
- New `booking_training_links` table: `id`, `booking_id`, `package_id`, `trainer_name`, `start_date`, `notes`, `created_at`
- RLS: Admin can manage packages, Front Desk+ can read and link bookings, Guest can read own links

**Frontend changes:**
- New `TrainingPackages` manager in Settings (Admin only) for CRUD on packages
- Training assignment section in `BookingDetailSheet` — Front Desk+ can assign a package to a booking
- Guest portal shows training package details on their stay page
- Dashboard stat card or badge showing "X guests currently training"

---

## Implementation Order

The work should be sequenced to minimize dependencies:

1. **Gap 4** (Analytics KPIs) — pure frontend, no DB changes, immediate value
2. **Gap 5** (CSV Export) — pure frontend, quick win
3. **Gap 3** (Email Sequences) — extends existing edge function
4. **Gap 1** (Housekeeping) — new table + trigger + UI
5. **Gap 2** (Security Deposits) — new table + policy settings + UI
6. **Gap 6** (Training Integration) — new tables + UI, most complex

Estimated scope: ~12-15 implementation messages across all six gaps.

