# Driver–Guest Pickup Messaging

## Goal
Give each assigned driver one expiring pickup link with no account or app. The same page shows pickup details, a short conversation with that guest, a WhatsApp fallback, and the existing **Guest is in the car** action.

## Build
1. Add a pickup-only message record tied to the driver link, pickup, and booking. It stores whether each message came from the driver, guest, or staff, plus timestamps and read state. It contains no booking price, balance, reference, or unrelated guest data.
2. Extend the existing driver-link service with safe actions to read and send messages using the expiring token. Validate and limit message length, throttle sends, reject expired/revoked links, and notify the guest plus front desk, managers, and admins immediately.
3. Add a simple conversation box to the driver's existing mobile page, with large send controls and a one-tap WhatsApp fallback when the guest has a phone number.
4. Add the same pickup conversation to the guest's existing pickup card so the guest can reply without finding another screen.
5. Make staff access obvious inside **Front Desk → Travel checks**: each pickup row will show **Driver link** and **Driver chat**, with unread/latest-message status. Staff can open the complete pickup conversation there; managers and admins use the same controls rather than a new dashboard.
6. Keep the existing Messages page focused on guest/staff conversation, but surface driver messages in the booking transcript with a clear **Driver** label where practical, so the operational record is not hidden.

## Guardrails
- No driver signup, login, profile, or app install.
- One link exposes one pickup only and expires automatically.
- Driver messages cannot execute bookings, payments, rooms, refunds, fees, or pickup changes.
- Only **Guest is in the car** can mark collection, using the existing audited action.
- Staff and guest access remains booking-scoped; all driver sends are timestamped and visible to authorized staff.

## Verification
- Test valid, expired, revoked, and wrong-token access.
- Test driver → guest, guest → driver, and staff visibility with live alerts.
- Confirm another guest cannot read the pickup conversation.
- Confirm no financial or unrelated guest data appears on the driver page.
- Check mobile layout and run the full test/type check suite.
