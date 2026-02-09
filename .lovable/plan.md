

# Ground Stay — Admin Dashboard MVP

## Overview
A warm, hospitality-styled admin dashboard for managing 6–20 accommodation units. Built with Supabase backend (auth, database, RLS) from day one. This first phase focuses on the **Admin perspective** with guest account support for future booking flows.

---

## 1. Authentication & Role System
- **Email/password login** for staff and guests
- User profiles table with name, avatar, and contact info
- Separate **user_roles** table (Admin role for V1, extensible for Manager, Front Desk, etc.)
- Protected routes — only authenticated Admins can access the dashboard
- Login and signup pages with warm, welcoming design

## 2. Dashboard Home
- **At-a-glance overview**: today's arrivals, departures, active bookings count, occupancy snapshot
- Quick-action cards for common tasks (add unit, create booking, view calendar)
- Clean, warm layout with soft accent colors and clear typography

## 3. Unit/Property Management
- **Unit list view** with cards showing photo, name, capacity, status (Active/Inactive)
- **Unit detail/edit page**: name, description, capacity, amenities (multi-select), photos, minimum nights, cleaning fee, unit-specific rules
- Toggle units Active/Inactive (inactive units hidden from guest-facing views)
- Add and remove units

## 4. Booking Management
- **Booking list** with filters by status, unit, and date range
- **Booking detail view** showing full state, guest info, unit, dates, pricing breakdown, and audit log
- **Booking state machine** with the 9 canonical states (Inquiry → Soft Hold → Pending Approval → Pending Deposit → Confirmed → Checked-In → Completed → Cancelled → No-Show)
- State transitions enforced — no skipping states without logged override
- Every state change recorded in an **audit log** with timestamp, user, and reason
- Offline payment recording support

## 5. Calendar View
- **Visual calendar** showing all units with blocked/available dates
- Color-coded by booking state (inquiry, hold, confirmed, checked-in, maintenance)
- Click a date range to start a new booking
- Cleaning buffers visually indicated
- No overlapping bookings enforced at the database level

## 6. Pricing & Policies (Admin Config)
- **Per-unit pricing**: base price, weekend price, seasonal pricing rules
- Manual price override per booking (logged)
- Policy defaults displayed and editable: soft hold expiration, deposit deadline, cancellation windows, check-in/check-out times, cleaning buffer
- All changes logged in audit trail

## 7. Reporting (Phase 1)
- **Occupancy rate** per unit and overall
- **Revenue per unit** over selectable date ranges
- **Blocked vs. bookable time** breakdown (including maintenance impact)
- Simple charts with warm color palette — descriptive only, no forecasting

## 8. Database Schema (Supabase)
Core tables to be created:
- `profiles` — user profile data
- `user_roles` — role assignments (Admin for V1)
- `units` — property/room definitions
- `bookings` — reservations with state field
- `booking_state_log` — audit trail for state transitions
- `pricing_rules` — seasonal/weekend pricing per unit
- `policy_settings` — system-wide configurable defaults
- `messages` — booking-linked communication log (internal notes)
- `payments` — payment records including offline

Row-level security on all tables, with `has_role()` helper function for policy checks.

## 9. Design Direction
- **Warm & hospitality** aesthetic: soft earth tones, rounded corners, welcoming typography
- Calm, ops-first language throughout — no urgency or pressure patterns
- Sidebar navigation with clear section grouping
- Responsive layout (desktop-first, mobile-friendly)
- Actions users can't perform are hidden, not grayed out
- Clear explanations when actions are blocked

