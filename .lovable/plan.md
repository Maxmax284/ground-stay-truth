
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
| Guest Messaging (display + reply in Guest Portal) | Done |
| Embed Widgets (listing, compact, calendar, CTA via edge function) | Done |
| Embed Availability (includes maintenance blocks) | Done |
| Phase 1 Reports (occupancy, revenue, state distribution, blocked vs bookable with maintenance) | Done |
| Staff Messaging (internal notes + guest-visible toggle) | Done |

## What is NOT STARTED

### 1. ID Document Upload for Check-in
The constitution requires uploaded ID documents before check-in can be completed. No storage bucket or upload UI exists.

### 2. Automated Refund Calculation on Cancellation
Policy tiers exist (free/partial/no-refund) but when cancelling a booking, no refund amount is calculated or displayed to staff.

---

## Recommended Next Phase

### Step 1: ID Document Upload
Create a `guest-documents` storage bucket, add upload UI to the booking detail sheet, and gate check-in completion on document presence.

### Step 2: Automated Refund Calculation
When staff cancels a booking, calculate and display the refund amount based on cancellation policy tiers (free/partial/no-refund) relative to check-in date.
