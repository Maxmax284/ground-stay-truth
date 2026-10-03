# CampStay LMT: messaging and ops audit, last 48h (read-only)

## Street read
The messaging pipeline works for real on the Lamai property, in both directions, by email and the in-app bell. That's **proven**.

What Nikki and Nam saw was the smoke test doing its job. Nam's "phone notification" was almost certainly the email landing in her Gmail app, or the in-app bell. Phone push isn't wired up: there are 0 push subscriptions, and the last push went out 30 Jul. Push alerts were deliberately taken off staff profiles, and email is the staff alert channel.

The 3 "failed" alerts were the sandbox test being blocked on purpose. The 271 pending and 33 failed emails are old (Jul 30 to Sep 1), so none of today's emails are stuck.

Nothing in the messaging path changed any booking, payment, room or check-in.

## 1. What changed
- 30 code commits in the window:
  - "I've landed / I'm here" arrival signal.
  - Unified Settings → Guest Guide & Welcome.
  - Stay Guide & Support tab.
  - Five-step readiness row on booking cards.
  - Sidebar "Preview Guest Portal" now opens the real /guest portal (look-only, every view audited).
  - Staff phone registry and attribution.
  - Pricing receipt fixes.
- No new database migrations in the window (the latest is 10 Sep).
- 1 new booking: the Smoke Test stay, Superior Twin 8, 3 to 6 Oct, confirmed. It is still on the calendar.

## 2. Messaging pipeline: proven
- 3 new messages, all from the portal and all tied to a booking.
- 0 internal notes sent in the window, so hiding internal notes wasn't re-tested today. It was proven in an earlier test, where notes sent no email.
- Orphan messages across the whole system: 0.
- Staff vs guest sender labels come from the staff phone registry and the sender lookup.

## 3. Smoke-test evidence
| Channel | Result |
|---|---|
| Message in thread | Proven (3 saved, linked to bookings) |
| In-app bell | Proven (52 notices: 24 message, 16 booking, 12 override) |
| Admin/manager email | Proven: "guest message received" 6 sent, "staff replied" 6 sent |
| Guest "you have a message" email | Proven: 2 sent |
| Anti-spam limit | Proven: 3 held back on purpose |
| Phone push / app push | Not live: 0 subscriptions, nothing sent since 30 Jul |
| WhatsApp | Not live: Business account still pending |

## 4. Nikki / Nam / Max notification health
- On the real property, all three got their emails.
- The 3 "failed" rows (02:57 UTC today) were the first run on Sandbox Camp, recorded as "not sent: sandbox". That's by design, not a fault.
- Old backlog:
  - 271 pending emails from 30 Jul to 26 Aug.
  - 33 failed emails from 29 Aug to 1 Sep, all caused by the shared-key bug that was later fixed.
  - Nothing new has been added to either since then. This is dead history, not a live queue.

## 5. Guest readiness: partially proven
- Real guests would get replies the same way: in the portal thread plus a debounced email linking to /guest.
- The deep link opens the portal. It doesn't jump to the exact thread, but the Messages tab is one tap away.
- Only one test guest identity was used. A real guest on a phone is not yet tested.

## 6. App vs browser vs email
- The installed app and the browser run the same portal and the same in-app bell. The bell only shows while the app is open.
- With no push, a closed app means email is the only alert. That's the intended design for now.

## 7. Stay Guide / Support
- Built and live:
  - One Settings hub (Getting Here, Camp & Room Essentials, Island Guide).
  - One guest tab that adapts to where the guest is in their trip.
  - Arrival signal buttons.
- Still fragmented or pending:
  - The Island Guide appears twice (its own tab plus a card).
  - The welcome-sheet boxes are empty.
  - Wi-Fi and emergency number placeholders are still saved.
  - Laundry and housekeeping request buttons aren't inside their binder sections yet.
  - The "landed" state is remembered on the device only.

## 8. Safety: proven
- 0 booking status changes in 48h.
- Every message path only saves the message and notifies people. Nothing changes a room, money, a pickup, a refund or a check-in.

## 9. Red flags and next fixes
1. Decide whether to clear or ignore the old email backlog (271 pending, 33 failed). It's cosmetic but confusing on the monitor.
2. Push to phones is off. Either accept email as the channel or plan push properly later.
3. Replace the placeholder Wi-Fi and emergency number and fill in the welcome sheet (Nikki).
4. Remove or keep the Smoke Test booking on Superior Twin 8.
5. Run a real-phone guest test: a portal message plus a reply email on iPhone Safari.
6. Optional: make the email link open the Messages tab directly.

## On approval
Save this report verbatim to `.lovable/recent-ops-audit.md`. That is the only write: no code or data changes, and no messages sent.
