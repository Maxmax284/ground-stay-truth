
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
| ID Document Upload (storage bucket, upload UI, check-in gating) | Done |
| Automated Refund Calculation (tier display on cancellation) | Done |

## What is NOT STARTED

### iCal Sync
Acknowledged in the constitution but explicitly deferred. No sync behavior or conflict resolution should be invented.

---

## Constitution Compliance Summary

All items from the Ground Stay constitution are now implemented:
- Booking state machine with 9 states, audit logging, and role-gated transitions
- ID document upload required before check-in completion
- Refund calculation displayed when cancelling (free/partial/no-refund tiers)
- Full RBAC with 7 roles and permission checks
- Policy settings for all configurable values
- Calendar truth rules with maintenance blocks, buffers, and overlap prevention
- Guest portal with messaging, listings, and cancellation policy display
- Embed widgets with accurate availability including maintenance blocks
- Phase 1 reports with occupancy, revenue, state distribution, and blocked vs bookable
- Offline payments with full audit trail
- Staff messaging with internal/guest-visible toggle
