

# Role-Tailored Dashboards and Approval Workflow

## The Problem

Right now, every staff role lands on the exact same dashboard. A booking sitting at "Pending Approval" requires you to: open the bookings page, find the booking, click it, scroll to the state transition section, pick "Pending Deposit" from a dropdown, type a reason, and confirm. There is no approval queue, no "Approve" button, and no role-specific experience.

## What Changes

### 1. Booking Approval Queue on the Dashboard (Admin + Manager)

Add a new card to the main dashboard that shows bookings waiting for action. For Admin/Manager, this prominently displays any "pending_approval" bookings with one-click approve (transitions to "pending_deposit") and a reject button (transitions to "cancelled"). Each item shows the unit name, guest name, dates, and how long it has been waiting.

This card also shows:
- Soft holds that are about to expire
- Deposit deadlines approaching
- Bookings ready for check-in today

### 2. Role-Aware Dashboard Sections

Adjust the dashboard so different roles see relevant content:

- **Admin**: Full stats + approval queue + pending users alert + all quick actions
- **Manager**: Full stats + approval queue + quick actions (no user management)
- **Front Desk / Supervisor**: Today's arrivals/departures prominently, active bookings, messages needing attention
- **Maintenance**: Calendar-focused view showing upcoming maintenance blocks and units currently occupied (so they know when they can do work)
- **Viewer**: Read-only stats and recent activity only (no quick action buttons)

### 3. Quick Approve/Reject from Bookings List

Add inline action buttons directly on the bookings table for "pending_approval" bookings. Admin and Manager see "Approve" and "Reject" buttons right in the row without needing to open the detail sheet. A small reason input pops up on click.

### 4. Fix Maintenance Role Usefulness

Currently maintenance staff can see the calendar but cannot create or manage maintenance blocks (requires Manager+). Add the ability for maintenance staff to *request* maintenance blocks that a Manager/Admin can then approve. Also show them which units are currently occupied vs available on their dashboard.

### 5. Notification Badges on Sidebar

Extend the existing pending-users badge pattern to show:
- Number of bookings pending approval (on Bookings nav item) -- visible to Admin/Manager
- Unread messages count (on Messages nav item) -- visible to anyone with message access

---

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/ApprovalQueue.tsx` | Dashboard card showing pending-approval bookings with approve/reject actions |
| `src/components/DashboardRoleSection.tsx` | Wrapper that renders different dashboard content based on the user's role |

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Import and render `ApprovalQueue` for admin/manager roles; render role-specific sections |
| `src/pages/Bookings.tsx` | Add inline approve/reject buttons on pending_approval rows for admin/manager |
| `src/components/AppSidebar.tsx` | Add pending-approval count badge on Bookings nav item, unread messages badge on Messages |
| `src/hooks/useBookings.ts` | Add a `usePendingApprovalCount` query and a `useQuickApprove` mutation |
| `src/hooks/useDashboard.ts` | Add query for pending-approval bookings list |
| `src/lib/permissions.ts` | Add `canApproveBooking` permission (Manager+) |
| `src/i18n/locales/en.json` | Add translation keys for approval queue, quick actions, role-specific labels |

### Database Changes

None required. The booking state transitions and RLS policies already support this -- admin can already transition any booking. We are just adding UI shortcuts for what is already possible in the backend.

### Approval Flow Logic

The "Approve" action:
1. Updates booking state from `pending_approval` to `pending_deposit`
2. Logs the transition in `booking_state_log` with reason "Booking approved"
3. Invalidates relevant queries to refresh the UI

The "Reject" action:
1. Prompts for a reason (required)
2. Updates booking state from `pending_approval` to `cancelled`
3. Logs the transition with the provided reason

### Sidebar Badge Queries

- **Pending approvals**: `SELECT count(*) FROM bookings WHERE state = 'pending_approval'` (admin/manager only, polls every 60 seconds)
- **Unread messages**: Not tracking read status currently -- this would need a `last_read_at` column on a new `message_reads` table, so we will skip this for now and revisit later

### Role-Specific Dashboard Layout

The `Index.tsx` page will use conditional rendering based on `role`:

```text
Admin/Manager:
  [Stats Row]
  [Approval Queue]    [Recent Activity]
  [Arrivals Today]    [Departures Today]
  [Quick Actions]

Front Desk/Supervisor:
  [Stats Row]
  [Arrivals Today]    [Departures Today]
  [Recent Activity]   [Quick Actions]

Maintenance:
  [Occupied Units]    [Upcoming Maintenance]
  [Calendar Link]

Viewer:
  [Stats Row]
  [Recent Activity]
```

