# Every message sends an email (guests, staff, admins) + full platform test pass

WhatsApp stays unwired. For now, email is the rail everyone can count on.

## What's broken today (checked in code)

| Who sends | Guest emailed? | Admins emailed? | Front desk told? |
|---|---|---|---|
| Staff replies in the app | Yes (debounced 10 min) | No, in-app bell only | No |
| Guest writes from the portal ("Talk to the camp") | n/a | **No, nothing fires at all** | **No** |
| Guest writes on Telegram | n/a | Yes (alert centre) | Yes (in-app) |

So the biggest hole: a guest writing from the portal reaches nobody except whoever happens to open Messenger.

## Fix

1. **Guest writes from the portal** → after the message saves, raise the existing "Guest message received" alert. That emails admins and staff who have it switched on, with the existing anti-spam (max 3 per admin per 5 min, critical-only switch respected), plus the in-app bell. Link goes straight to that guest's thread.
2. **Staff replies** → guest email stays as is. Add a quiet admin email: new alert "Staff replied to a guest" (off-by-default-able in the alert settings, same 3-per-5-min cap) so admins see overall activity without being buried. Internal notes never email anyone.
3. **Guest confirmation** → guest sees "Sent — the camp has been emailed" under the composer so they know it landed. No extra email to the guest for their own message.
4. **Failure is loud but harmless** → if email fails, the message is still saved; the attempt is logged so we can see it in the email log.

Nothing here touches bookings, pickups, rooms, payments or check-in. Messaging still only feeds the system.

## Full platform test pass (after the fix)

Run end to end as a real guest and as staff, report pass/fail per area:
- Guest: sign in, portal loads, journey banner, flight tracker, pickup card, language picker, "Talk to the camp" send → admin email logged.
- Staff: Front Desk, Arrivals Board, Check-In Desk, Bookings, booking sheet chat buttons open the right thread; reply → guest email logged, admin email logged, internal note → no email.
- Driver link, island guide, budget panel, payments tab balance display (read only, no money moved).
- Email log check for every send above; automated tests + typecheck green.
- Staff screens behind MFA: I'll cover what I can; anything blocked by the MFA prompt gets listed for Nikki to tap through on her phone.
- Test messages cleaned up afterwards.

## Technical notes
- Make `notify-guest-message` direction-aware: caller is booking's guest → `emitAdminAlert("guest_message_received", {referenceId: booking_id, deepLink: "/messages?booking=…", context:{channel:"portal"}})`; caller is staff → existing guest email + new `staff_replied_to_guest` alert. Guest caller must own the booking (verified server-side), else 403.
- Add `staff_replied_to_guest` to both adminAlertCatalog files (default email on, severity info, 3/5min).
- Invoke the function from the guest send path in `GuestThreadDialog` (fire-and-forget), same as `useBookings`.
- Idempotency keys stay recipient-scoped (`…-${message.id}-${email}`).
- Redeploy `notify-guest-message` and `emit-admin-alert`; verify via email logs.
