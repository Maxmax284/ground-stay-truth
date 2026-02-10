

# Calendar Enhancement + Guest Portal Preview

## Two Enhancements

### 1. Enhanced Calendar Views

The current calendar is a 30-day horizontal Gantt-style grid (desktop) or a 7-day vertical list (mobile). This adds two new view modes accessible via a toggle:

**Month View**: A traditional calendar grid (like Google Calendar) showing the full month with booking indicators in each day cell. Clicking a day shows the bookings for that day. Includes month navigation (prev/next arrows).

**Day View**: A detailed single-day view showing all units and their status for that specific day -- who's checked in, who's arriving, who's departing, maintenance blocks, and available slots. Useful for front desk operations.

**Where it appears:**
- Staff dashboard calendar page (`/calendar`) -- all three views available via a toggle (Timeline | Month | Day)
- Guest portal (`/guest`) -- a new "Calendar" tab showing a month view of their own bookings only (read-only, no booking creation)

**View toggle**: Three buttons next to the existing navigation controls: "Timeline" (current default), "Month", and "Day". The Day view can also be reached by clicking a day cell in the Month view.

### 2. Guest Portal Preview for Admins

Add a way for admins to see what the guest portal looks like without needing a guest account. This will be a simple link/button in the Settings page or sidebar that opens the guest portal in preview mode.

**Implementation**: Add a route parameter `/guest?preview=true` that, when accessed by an admin, renders the guest portal with sample/mock data instead of requiring a guest-role account. The `ProtectedRoute` component will be updated to allow admins through on the guest route when the preview flag is set.

---

## Technical Plan

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/CalendarMonthView.tsx` | Month grid component -- 7-column grid, day cells with booking dots/bars, click-to-drill-down |
| `src/components/CalendarDayView.tsx` | Day detail component -- lists all units with their booking status for a single day |

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/CalendarView.tsx` | Add view mode toggle (timeline/month/day), render the appropriate component based on selection |
| `src/pages/GuestPortal.tsx` | Add a "Calendar" tab with a read-only month view of the guest's bookings |
| `src/components/ProtectedRoute.tsx` | Allow admin users to access `/guest` route when `?preview=true` is in the URL |
| `src/components/AppSidebar.tsx` | Add "Preview Guest Portal" link for admin users |
| `src/i18n/locales/en.json` | Add translation keys for new calendar views and guest portal preview |

### Month View Component Design

- Standard 7-column calendar grid (Sun-Sat)
- Each day cell shows:
  - Day number (highlighted if today)
  - Small colored dots or mini-bars for bookings (color-coded by state, same as existing legend)
  - Hatched indicator for maintenance blocks
  - Click a day to switch to Day View for that date
- Month navigation arrows (same style as existing)
- Weekend columns slightly shaded (consistent with timeline view)
- Grayed-out cells for days outside the current month

### Day View Component Design

- Header shows the selected date with prev/next day arrows
- Table/list of all active units, each row showing:
  - Unit name
  - Status for that day: Available, Booked (with guest name + state badge), Maintenance (with reason), or Cleaning Buffer
  - Click a booking to open the BookingDetailSheet (reuses existing component)
  - Click an available slot to open the BookingFormDialog (reuses existing component)
- Summary bar at top: "X of Y units occupied, Z arriving, W departing"

### Guest Portal Calendar Tab

- Simple month view (reuses CalendarMonthView with a `readOnly` prop)
- Only shows the guest's own bookings (filtered by `guest_id`)
- Day cells show check-in/check-out indicators for their stays
- No click-to-create functionality
- Consistent with the existing tab pattern (Bookings | Listings | Policies | Calendar)

### Admin Guest Portal Preview

- Admin clicks "Preview Guest Portal" in sidebar or settings
- Opens `/guest?preview=true`
- ProtectedRoute allows admin through without guest role requirement
- GuestPortal detects preview mode and shows a banner: "You are previewing the Guest Portal as an admin"
- Shows real data (units, policies) but bookings section shows empty state or sample bookings
