

# Mobile Responsiveness and Missing UX Gaps Fix

## What This Plan Addresses

Based on a full audit against the constitution, there are real gaps in mobile usability and some missing UI/UX pieces. This plan fixes the most impactful ones.

---

## Problems Found

### 1. Bookings Table Unusable on Mobile (Critical)
The bookings list uses a 7-column HTML table that overflows on small screens. On mobile, staff should see a card-based list instead.

### 2. Calendar Grid Unusable on Mobile (Critical)
The 30-day horizontal grid with all units is designed for wide screens. On mobile it requires painful horizontal scrolling and tiny tap targets.

### 3. Booking Filters Overflow on Mobile
Filter dropdowns have fixed widths (160px, 180px, 150px) that wrap awkwardly on narrow screens.

### 4. No Standalone Messaging View
Staff must open individual bookings to see messages. There is no inbox or overview showing "which bookings have unread messages." The constitution requires all guest communications to be logged per booking, but staff need a way to see what needs attention.

### 5. Embeds Have No Action Path
The CTA embed shows "Check Availability" but the button does nothing. There is no way for a website visitor to take action after viewing an embed -- no link to guest portal, no contact form, no booking request.

### 6. No New-User Notification for Admins
When someone signs up and lands on "Pending Access," no one is notified. The admin has to manually check the Users and Roles screen to discover new users waiting for role assignment.

---

## Plan

### Step 1: Responsive Bookings List
**File: `src/pages/Bookings.tsx`**

- Detect mobile using the existing `useIsMobile()` hook
- On mobile: render booking cards (unit name, guest, dates, state badge) instead of the table
- Each card is tappable to open the detail sheet
- Keep the table for desktop -- no changes to desktop experience

### Step 2: Responsive Booking Filters
**File: `src/components/BookingFilters.tsx`**

- Change fixed widths to `w-full sm:w-[160px]` etc.
- Stack filters vertically on mobile (single column) and horizontally on desktop
- This is a small CSS-only change

### Step 3: Mobile-Friendly Calendar
**File: `src/pages/CalendarView.tsx`**

- On mobile: switch to a single-unit view with a unit selector dropdown at the top
- Show a 7-day rolling window instead of 30 days
- Use a vertical day list instead of horizontal grid
- Keep the full grid on desktop

### Step 4: Embed CTA Link
**File: `src/pages/EmbedWidget.tsx`** and **`src/components/EmbedCodeGenerator.tsx`**

- Add a `contact_url` query parameter to embeds (e.g., `?contact_url=https://yoursite.com/contact`)
- When provided, the "Check Availability" button in the CTA embed links to that URL
- Update the Embed Code Generator in Settings to include a "Contact URL" field
- This keeps embeds public and stateless while giving visitors a clear action path

### Step 5: Pending Users Indicator for Admins
**File: `src/components/AppSidebar.tsx`** and new query

- For admin users: query profiles that have no matching row in `user_roles`
- Show a small badge count on the "Settings" nav item (e.g., "Settings (2)")
- This alerts admins that users are waiting for role assignment without requiring a separate notification system

---

## What's NOT Included (and Why)

- **Standalone messaging inbox**: This would be a significant new feature (new page, new queries, unread tracking). It's worth building but is a separate effort.
- **Booking through embeds**: The constitution says embeds are presentation-only and Ground Stay manages truth. Adding booking through embeds would require a public booking API which is a separate feature scope.
- **Push notifications**: Would require a service worker setup and is a separate feature.

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Bookings.tsx` | Add mobile card view alongside existing table |
| `src/components/BookingFilters.tsx` | Make filter widths responsive |
| `src/pages/CalendarView.tsx` | Add mobile single-unit vertical calendar view |
| `src/pages/EmbedWidget.tsx` | Add contact_url parameter support to CTA embed |
| `src/components/EmbedCodeGenerator.tsx` | Add Contact URL field for embed generation |
| `src/components/AppSidebar.tsx` | Add pending-users badge for admin role |

No database changes needed.
