

# Stay Support Module -- Maintenance Requests and Laundry Tracking

## Overview

This adds a "During Stay" lifecycle layer to Ground Stay. Two new features -- room issue reporting and laundry workflow tracking -- are available only when a booking is in the `checked_in` state. They integrate into the existing guest portal, booking detail sheet, staff dashboard, and audit system without touching the booking state machine.

---

## 1. Database Schema

### New Tables

**`maintenance_requests`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| booking_id | uuid NOT NULL | FK to bookings |
| unit_id | uuid NOT NULL | FK to units |
| category | text NOT NULL | One of: plumbing, electrical, appliance, cleanliness, other |
| description | text NOT NULL | |
| photo_url | text | Optional, storage path in a new `maintenance-photos` bucket |
| status | text NOT NULL DEFAULT 'open' | One of: open, in_progress, resolved |
| priority | text NOT NULL DEFAULT 'normal' | normal or urgent |
| created_by | uuid | FK to auth.users -- the guest or staff who reported |
| resolved_by | uuid | FK to auth.users -- staff who resolved |
| resolution_note | text | Required when marking resolved |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

**`laundry_requests`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| booking_id | uuid NOT NULL | FK to bookings |
| unit_id | uuid NOT NULL | FK to units |
| bag_count | integer | Optional |
| note | text | Optional guest note |
| status | text NOT NULL DEFAULT 'received' | One of: received, in_progress, ready_for_pickup, collected |
| created_by | uuid | FK to auth.users |
| updated_by | uuid | FK to auth.users -- last staff who changed status |
| created_at | timestamptz DEFAULT now() |
| updated_at | timestamptz DEFAULT now() |

**`stay_support_log`** (audit table for both features)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| booking_id | uuid NOT NULL | FK to bookings |
| request_type | text NOT NULL | 'maintenance' or 'laundry' |
| request_id | uuid NOT NULL | ID of the maintenance_request or laundry_request |
| action | text NOT NULL | e.g. 'created', 'status_changed', 'resolved', 'note_added' |
| from_status | text | Previous status |
| to_status | text | New status |
| changed_by | uuid | FK to auth.users |
| note | text | Optional context |
| created_at | timestamptz DEFAULT now() |

All three tables get an `updated_at` trigger using the existing `update_updated_at_column()` function.

### New Storage Bucket

- `maintenance-photos` -- public: false (staff + owner access only)

---

## 2. RLS Policies

### maintenance_requests

- **Guests can create** -- WHERE `created_by = auth.uid()` AND booking is theirs AND booking state = 'checked_in'
- **Guests can read own** -- WHERE EXISTS (SELECT 1 FROM bookings WHERE bookings.id = maintenance_requests.booking_id AND bookings.guest_id = auth.uid())
- **Staff can read all** -- `has_role(auth.uid(), 'front_desk')` (covers front_desk, supervisor, manager, admin, maintenance via hierarchy)
- **Maintenance can update** -- `has_role(auth.uid(), 'maintenance')` (mark in_progress, resolved)
- **Manager/Admin full control** -- `has_role(auth.uid(), 'manager')` or `has_role(auth.uid(), 'admin')`

### laundry_requests

- **Guests can create** -- same pattern as maintenance (own booking, checked_in state)
- **Guests can read own** -- same pattern
- **Staff can read all** -- `has_role(auth.uid(), 'front_desk')`
- **Staff can update status** -- `has_role(auth.uid(), 'front_desk')` (front desk, supervisor, maintenance, manager, admin can all update)
- **Manager/Admin full control** -- ALL policy

### stay_support_log

- **Staff can read** -- `has_role(auth.uid(), 'front_desk')`
- **Guests can read own** -- via booking ownership join
- **Insert** -- any authenticated user (system logs on actions)
- **Admin full control** -- ALL policy

### maintenance-photos bucket (storage.objects)

- **Guests can upload** to their booking path -- `auth.uid()` matches booking guest_id
- **Staff can read** -- `has_role(auth.uid(), 'front_desk')`

---

## 3. Permission Checks (permissions.ts)

Add these to the existing permissions object:

```
canCreateMaintenanceRequest -- Guest (own booking) or Front Desk+
canResolveMaintenanceRequest -- Maintenance role or Manager+
canUpdateMaintenanceStatus -- Maintenance role or Manager+
canViewMaintenanceRequests -- Front Desk+ (all) or Guest (own)
canCreateLaundryRequest -- Guest (own booking) or Front Desk+
canUpdateLaundryStatus -- Front Desk+ (all staff)
canViewLaundryRequests -- Front Desk+ (all) or Guest (own)
```

---

## 4. New Files

### Hooks

| File | Purpose |
|------|---------|
| `src/hooks/useMaintenanceRequests.ts` | CRUD + status transitions for maintenance_requests, audit logging |
| `src/hooks/useLaundryRequests.ts` | CRUD + status transitions for laundry_requests, audit logging |
| `src/hooks/useStaySupportLog.ts` | Read audit log for a booking's stay support actions |

### Guest Portal Components

| File | Purpose |
|------|---------|
| `src/components/GuestStaySupport.tsx` | "Stay Support" tab content for guest portal -- shows maintenance request form, laundry drop-off form, and lists of existing requests with status badges |

### Staff Components

| File | Purpose |
|------|---------|
| `src/components/MaintenanceQueue.tsx` | Staff panel showing all open/in-progress maintenance requests across units, with action buttons |
| `src/components/LaundryPanel.tsx` | Staff panel showing all laundry requests with status progression buttons |
| `src/components/StaySupportBadge.tsx` | Small icon badge component for booking headers indicating active maintenance/laundry |

---

## 5. Modified Files

### `src/pages/GuestPortal.tsx`

- Add a "Stay Support" tab to the TabsList -- only visible when the guest has at least one `checked_in` booking
- Tab content renders `GuestStaySupport` component, scoped to checked-in bookings only
- Uses the existing tab pattern (Bookings, Listings, Messages, Calendar, Policies, Profile -- now adds Stay Support between Messages and Calendar)

### `src/components/BookingDetailSheet.tsx`

- Add a "Support" tab to the existing Tabs (History, Payments, Notes, Documents -- now adds Support)
- Tab only appears when booking state is `checked_in`
- Shows maintenance requests and laundry requests for this booking
- Staff can take actions directly from this tab (mark in progress, resolve, update laundry status)
- The "Next Step" banner updates to reflect:
  - "X open maintenance request(s)" if any exist
  - "Laundry ready for pickup" if applicable

### `src/pages/Index.tsx` (Dashboard)

- For Maintenance role: Add a "Maintenance Requests" card showing open/in-progress requests with action buttons
- For Manager/Admin: Add a summary card showing count of open maintenance requests and pending laundry
- For Front Desk/Supervisor: Add a small indicator showing active stay support items

### `src/components/AppSidebar.tsx`

- No new nav items needed -- stay support lives inside existing pages (dashboard, booking detail)
- Add a badge count on Dashboard nav item for maintenance role showing open request count

### `src/lib/permissions.ts`

- Add the 7 new permission checks listed in section 3

### `src/i18n/locales/en.json`

- Add `staySupport` namespace with keys for:
  - Tab labels, form labels, category names
  - Status labels (open, in_progress, resolved, received, ready_for_pickup, collected)
  - Action buttons (report issue, drop off laundry, mark in progress, mark resolved, mark ready, mark collected)
  - Validation messages
  - Next step messages

---

## 6. Audit Integration

Every action writes to `stay_support_log`:

- Guest creates maintenance request -> `action: 'created', request_type: 'maintenance'`
- Staff marks in_progress -> `action: 'status_changed', from_status: 'open', to_status: 'in_progress'`
- Staff resolves with note -> `action: 'resolved', to_status: 'resolved', note: resolution_note`
- Guest creates laundry request -> `action: 'created', request_type: 'laundry'`
- Staff updates laundry status -> `action: 'status_changed'` with from/to

The BookingDetailSheet's History tab will also query and display stay_support_log entries alongside booking_state_log, so all activity appears in one timeline.

---

## 7. UI/UX Details

### Guest Stay Support Tab

- Two sections: "Room Issues" and "Laundry"
- "Report Room Issue" button opens an inline form (not a dialog) with:
  - Category dropdown (Plumbing, Electrical, Appliance, Cleanliness, Other)
  - Description textarea (required, max 500 chars)
  - Optional photo upload button
  - Submit button
- "Laundry Drop-Off" button opens inline form:
  - Bag count (optional number input)
  - Note (optional textarea)
  - Confirm button
- Below each form: list of existing requests with status badges
- Status badges use existing design language:
  - Open: warning style (amber)
  - In Progress: info style (blue)
  - Resolved: success style (green)
  - Received: muted
  - Ready for Pickup: info with highlight
  - Collected: success

### Staff Maintenance Queue

- Table/card layout showing: Unit name, Guest name, Category badge, Description preview (truncated), Status badge, Time since created, Priority
- Action buttons inline: "Start" (open -> in_progress), "Resolve" (requires note textarea)
- Resolved items can be filtered out (default: show open + in_progress)

### Staff Laundry Panel

- Simpler table: Guest, Unit, Drop-off time, Bag count, Status
- Linear status progression buttons: Received -> In Progress -> Ready -> Collected
- Each click advances to next status

### Booking Detail Sheet Support Tab

- Shows maintenance requests and laundry requests for this specific booking
- Staff can take actions from here too
- Compact card layout matching existing tab styles

---

## 8. Edge Cases

- **Guest checks out with open maintenance request**: Request stays open, staff can still resolve it. No auto-close.
- **Multiple checked-in bookings**: Guest sees requests scoped per booking. The Stay Support tab shows a booking selector if multiple are checked in.
- **Photo upload fails**: Maintenance request still creates without photo. Toast error for the photo failure.
- **Concurrent status updates**: Last write wins (standard optimistic update with refetch). The audit log captures all attempts.
- **Guest tries to create request on non-checked-in booking**: RLS blocks it. UI doesn't show the form.
- **No deletion**: Neither guests nor staff can delete requests. Only status changes are allowed.

---

## 9. Migration Strategy

1. Run migration adding all three tables + triggers + RLS policies + storage bucket (single migration file)
2. Add permission checks to `permissions.ts`
3. Create hooks (useMaintenanceRequests, useLaundryRequests, useStaySupportLog)
4. Create UI components (GuestStaySupport, MaintenanceQueue, LaundryPanel, StaySupportBadge)
5. Integrate into GuestPortal, BookingDetailSheet, Index dashboard
6. Add translation keys
7. All changes are additive -- no existing tables, state machine logic, or RLS policies are modified

