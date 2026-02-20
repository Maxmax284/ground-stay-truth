

# Fill the Inquiry Gap -- Dashboard Queue and Smarter Notifications

## The Problem

Right now, when a guest submits a booking request (inquiry), the system:
- Creates the booking in "inquiry" state
- Sends a generic "New booking created" notification to admins/managers

But there is NO dedicated inbox or queue for new inquiries on the dashboard. Staff only see the Approval Queue (which shows bookings already at "Pending Approval" stage). New inquiries get buried -- staff have to manually navigate to Bookings and filter by state to find them.

## What This Plan Adds

### 1. Inquiry Queue on the Dashboard

A new "Inquiry Queue" card on the dashboard, shown above the existing Approval Queue. It displays all bookings in "inquiry" state with:
- Unit name, guest name, dates, and time since submission
- Two action buttons: "Hold" (moves to soft_hold) and "Dismiss" (cancels with reason)
- A count badge that shows how many inquiries are waiting

Visible to the same roles that can see the Approval Queue (managers, admins, and supervisors who can transition states).

### 2. Better Notification Messages

Update the notification text when a guest (not staff) creates a booking inquiry:
- Current: "New booking created for Jun 15 - Jun 20"
- New: "New guest inquiry: [Unit Name] Jun 15 - Jun 20 -- action needed"

This makes the notification bell alerts immediately actionable.

### 3. Inquiry Count in Dashboard Stats

Add an "Open Inquiries" stat card to the dashboard stats row so the number is always visible at a glance.

## Technical Details

### Files to create:
- `src/components/InquiryQueue.tsx` -- New component modeled after `ApprovalQueue.tsx` but for "inquiry" state bookings, with "Hold" and "Dismiss" actions

### Files to modify:
- `src/pages/Index.tsx` -- Add InquiryQueue above ApprovalQueue, add inquiry count stat card
- `src/hooks/useDashboard.ts` -- Add `pendingInquiry` query (bookings where state = 'inquiry')
- `src/hooks/useBookings.ts` -- Improve the notification message in `useCreateBooking` to differentiate guest inquiries from staff bookings, include unit name
- `src/i18n/locales/en.json` -- Add translation keys for inquiry queue labels, actions, and notification text

### InquiryQueue component behavior:
- Fetches bookings with `state = 'inquiry'`, ordered by `created_at` ascending (oldest first)
- "Hold" button transitions inquiry to soft_hold with reason "Inquiry acknowledged"
- "Dismiss" button opens a reason dialog (same pattern as ApprovalQueue reject) and transitions to cancelled
- Shows wait time using `formatDistanceToNow`
- Highlighted border when count is greater than 0

### Notification improvement:
- When `useCreateBooking` fires and the booking is an inquiry from a guest (guest_id matches current user), the notification to admins/managers will include the unit name and say "action needed"
- When staff creates a booking (not a guest), the existing message stays

### Dashboard layout order:
1. Stats row (arrivals, departures, active bookings, units, NEW: open inquiries)
2. Inquiry Queue (NEW)
3. Approval Queue (existing)
4. Arrivals/Departures/Activity/Quick Actions (existing)
5. Maintenance/Laundry (existing)
