# Recent Ops Audit (last 48h) — findings and report save

Plan mode only allows this file, so the read-only queries are already done. Approving this plan saves the full report to `.lovable/recent-ops-audit.md`. Nothing else gets written, no messages go out, and no data changes.

## Key findings (from the database, last 48h)

**What changed**
- 30 code commits: the "I've landed / I'm here" signal, the unified Guest Guide & Welcome hub, the Stay Guide & Support tab, the booking readiness row, the real-portal admin preview, and the staff phone registry.
- No new database migrations in this window. The newest one is from 10 Sep.

**Messaging**
- 3 new messages, all from the portal and all tied to a booking. None are internal notes.
- Orphan messages across the whole system: 0. Every message has a booking.
- No booking state changes at all in 48h, so messages changed no rooms, money, pickups or check-ins.
- 1 new booking: the Smoke Test stay (Superior Twin 8, 3 to 6 Oct, confirmed). It is still on the calendar.

**Notifications**
- Staff/admin alert log:
  - "Guest message received": 6 sent, 3 failed.
  - "Staff replied to guest": 6 sent.
- Emails:
  - 12 admin alert emails sent.
  - 3 held back by the anti-spam limit (working as designed).
  - 2 "you have a message" emails sent to the guest.
- In-app bell notifications: 52 created.
- Phone/app push: 0 push subscriptions and 0 push deliveries are recorded. That doesn't match Nam getting a phone notification. Most likely it was his email app or the in-app bell, not a push, but this is unconfirmed.

**Smoke test proven**
- Both directions work: guest to camp, and camp to guest.
- Max, Nikki and Nam all got emails, which lines up with what Nikki and Nam reported.
- The anti-spam limit kicked in.

**Risky / pending**
- 3 failed "guest message received" alerts need their error reason read.
- The email backlog has grown: 271 pending (was 210), 33 failed and 4 bounced across all time. This looks like a stuck queue.
- Portal telemetry shows 2 "booking missing" events, probably no-booking signups.
- Push is effectively not live.
- The welcome sheet content is still empty, and the Wi-Fi and emergency number placeholders are still saved.
- WhatsApp is still pending.

## On approval
1. Read the failure reasons for the 3 failed alerts, the oldest pending emails, and the 2 "booking missing" accounts. All read-only.
2. Check the code paths for in-app vs push notifications to explain what Nam saw.
3. Write `.lovable/recent-ops-audit.md` with these sections: What changed, What is working, What the smoke test proved, Still risky/pending, Next checks. Plain English, no message bodies, no secrets.
