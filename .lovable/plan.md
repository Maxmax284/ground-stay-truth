# Admin Booking Flow: Guest Account → Driver → Landing → Arrivals Board

## Goal
Build one admin-only flow that lets staff create a real guest booking from the dashboard, assign pickup details and a driver, mark/confirm landing, then immediately see the booking on the Arrivals Board.

This must not depend on a standing test account, shared “death/test” account, hardcoded login, or any bypass. Any temporary validation data gets cleaned up after testing.

## What will change

### 1. Add an admin booking-flow entry point
- Add an admin-only page in the staff dashboard, likely under Bookings or a new “New Booking Flow” route.
- Make it a guided flow instead of scattered forms:
  1. Guest details
  2. Stay details
  3. Arrival / pickup details
  4. Driver assignment
  5. Review and create

### 2. Create or link the guest safely
- Let admin enter guest name, email, phone, language, and optional notes.
- If the email already belongs to a guest, link the booking to that guest.
- If not, create the guest account through the existing backend account-creation path.
- No shared testing account. No hardcoded guest. No client-side role trick.

### 3. Create the booking and pickup together
- Create the booking with unit, dates, guest count, price fields, and booking state.
- Create airport pickup details for that booking when pickup is needed.
- Keep staff control over pickup status, fee, driver, vehicle, and assignment.
- Respect the existing booking state machine instead of jumping around it.

### 4. Assign driver from the same flow
- Pull active drivers from the current driver system.
- Let admin assign driver, vehicle/plate if already stored, pickup airport, arrival flight, and meeting notes.
- Save assignment into the existing pickup records so guest Confirm Landing can show driver name, plate, vehicle, and meeting point.

### 5. Confirm landing from staff/admin side
- Add a staff-side “Confirm landing” / “Guest landed” action for a booking with pickup.
- Reuse the same landing semantics as the guest Confirm Landing path where possible.
- Send the same staff/guest-facing notifications, but clearly mark when staff confirmed it.
- Do not fake a guest tap.

### 6. Arrivals Board visibility
- Make sure newly created bookings appear on the Arrivals Board immediately if they are in the arrival window.
- Show guest name, unit, booking state, flight status, pickup status, driver name/plate, landed timestamp, and last message.
- Add refresh/realtime invalidation if needed so admins do not have to hunt for it.

### 7. Test-account cleanup / no single point of failure
- Do not create a permanent testing guest account.
- If validation requires a real booking, create a clearly named temporary test guest/booking and delete or cancel/clean it after verification.
- Remove or avoid any old “death/test” account references if they exist in code or seed-like data.
- No hidden admin bypass, no shared password, no special testing role.

## Technical approach
- Reuse existing pieces where possible:
  - `create-staff-account` style backend account creation patterns, adjusted for guest accounts if needed.
  - Existing `bookings`, `airport_pickups`, `drivers`, `messages`, and `notifications` tables.
  - Existing driver hooks and Arrivals Board hook.
  - Existing `guest-landed` logic for landing state, but add a staff-safe path if the current function only allows the guest owner.
- Any new backend table writes stay behind server-side role checks.
- Any new public-table migrations include grants and RLS policies in the same migration.
- Add audit records for admin-created guest accounts, bookings, driver assignments, and staff-confirmed landing.

## Validation
- Run the admin flow end-to-end in preview:
  1. Create/link a guest
  2. Create a booking
  3. Assign driver
  4. Confirm landing
  5. Verify it appears on Arrivals Board
  6. Verify guest-facing driver/meeting-point data is available
  7. Clean up temporary test data
- If MFA blocks browser automation, validate source/database paths and ask you to do the one MFA-gated click-through on your phone.

## Out of scope for this pass
- Payments/refunds changes.
- Changing pricing rules.
- New messaging channels.
- Any guest impersonation or permanent shared QA account.
