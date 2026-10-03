# CampStay LMT: ops and notification audit, last 48h (read-only)


## Street read
- Messaging is **proven** on the real property, both directions, by email and the in-app bell.
- Phone push (the scooter horn) is in the walls: button, wiring and a sending function all exist.
- But the battery is flat. There are 0 saved devices, the last push attempt was 30 Jul, and every attempt then failed with "Failed to decode base64", which points at a key format problem.
- Staff also lost their push button when it was removed from the profile page.
- So Nam got an **email** (Gmail on her phone) and/or the **in-app pop-up banner** that slides down while CampStay is open. Not a true push. That's inferred, not proven, but it's the only lane with any record.
- Nothing in messaging or notifications changed a booking, money, room, pickup, refund or check-in.

## 1. What changed (48h)
- 30 commits:
  - "I've landed / I'm here".
  - Guest Guide & Welcome hub.
  - Stay Guide & Support tab.
  - Readiness row on booking cards.
  - Sidebar preview now opens the real /guest portal.
  - Staff phone registry.
  - Pricing receipt fixes.
- No new migrations.
- 1 new booking: the Smoke Test stay, Superior Twin 8, 3 to 6 Oct, still on the calendar.

## 2. Messaging pipeline: proven
- 3 new messages, all from the portal and all tied to a booking.
- Orphan messages: 0 system-wide.
- No internal notes in the window. Hiding them was proven in an earlier test.

## 3. Smoke-test evidence
| Lane | Status |
|---|---|
| Thread message | Proven |
| In-app bell (`notifications`) | Proven: 52 in 48h (24 message, 16 booking, 12 override) |
| Admin/manager email | Proven: 6 "guest message", 6 "staff replied" |
| Guest "you have a message" email | Proven: 2 sent |
| Anti-spam limit | Proven: 3 held back |
| Sandbox block | Proven: 3 rows "not sent: sandbox" at 02:57, by design |
| True phone push | Not live: 0 subscriptions, 0 deliveries since 30 Jul |
| WhatsApp | Not connected (Business account pending) |

## 4. Old email backlog
- 271 "pending" emails from 30 Jul to 26 Aug, and 33 failed from 29 Aug to 1 Sep.
- The failures were all `recipient_mismatch`, the shared-key bug that was later fixed.
- 4 bounced.
- Nothing new has been added since then, so this is dead history, not a live queue.

## 5. Notification wiring: what exists
- **Manifest:** `public/manifest.webmanifest` is valid (standalone, icons, start `/index`).
- **Service worker:**
  - `public/sw.js` loads `public/sw-push.js`.
  - It's registered in `src/main.tsx` everywhere except preview and iframes.
  - When the app is in front it shows a banner instead of a phone notification.
  - Tapping a notification opens the deep link.
- **Keys:** `send-push` reads `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from secrets, with `policy_settings.vapid_public_key` as a fallback. There's a health check that tests the key lengths. The 30 Jul errors suggest a key format problem that needs re-checking with that health check (read-only).
- **Device table:** `push_subscriptions`.
  - Tied to the user, with platform (ios/android/desktop) and a standalone flag.
  - Not tied to a booking, which is fine.
  - Dead devices (404 or 410 from the push service) get deleted automatically; temporary errors keep the device.
  - Log table: `push_delivery_log`.
- **Delivery lanes:**
  - `create-notification` writes the bell row and then calls `send-push`.
  - `emit-admin-alert` writes `admin_alert_log`, sends email, and also calls `send-push`.
  - So the doctrine of one event feeding several lanes is already mostly in place. Two places feed it (bell and admin alert); that's not a second stack.
- **Guest prompt:**
  - `GuestStayUpdatesPrompt` sits in `GuestPortal.tsx` and explains the value first.
  - Permission is only asked on a tap, never on page load.
  - Dismissing it hides it for 3 days. It hides itself if the browser has blocked notifications.
  - The setup hook (`usePushNotifications`) detects iPhone not on the Home Screen ("needs install").
  - `PWAInstallBanner` gives install instructions, but only on `/stay` (guest) and the staff layout, not inside `/guest` beside the prompt.
- **Staff side:**
  - `PushNotificationToggle`, `VapidKeySettings` and `PushHealth` (Monitoring) exist.
  - But the staff profile push toggle was removed on purpose ("email is the staff alert channel"), so staff have no obvious button left.
- **Choosing what to be alerted about:** `NotificationPreferencesPanel` plus the alert centre severity and "critical-only" settings.

## 6. Why push is zero
1. Every device saved before 30 Jul failed with a key decode error, and was presumably cleared after.
2. Staff have no visible enable button any more.
3. Guests only see the prompt inside /guest, and on iPhone it needs a Home Screen install first. The install instructions don't appear next to the prompt on /guest.
4. Not proven: whether the current keys are valid now. The `send-push` health check would confirm it.

## 7. Event trace (as wired today)
| Event | Bell | Push attempted | Email | Logged | Rate-limited |
|---|---|---|---|---|---|
| Guest messages staff | yes (admin alert) | yes, no devices | yes | admin_alert_log | 3 per 5 min |
| Staff replies guest | yes | yes, no devices | guest email, 10-min debounce | email_send_log | yes |
| "I've landed / I'm here" | same as guest message | same | yes | yes | yes |
| ID upload / payment / pickup / large adjustment / laundry / maintenance | admin alert triggers exist (`trg_alert_*`) | via emit-admin-alert | yes | yes | alert caps |
| ID needs replacement / payment action (guest side) | partial: guest-facing lane not confirmed | unknown | template not confirmed | — | — |
| Booking missing | telemetry only (2 events) | no | no | portal activity | — |

Internal notes skip every notification lane (checked in `notify-guest-message`).

## 8. Browser reality
- **Android Chrome, desktop Chrome, Firefox:** push supported.
- **iPhone Safari tab:** no push. Must Add to Home Screen first (iOS 16.4+).
- **Desktop Safari:** supported on macOS 13+.
- **Instagram/Facebook in-app browsers:** no push and no install. Not detected today.

## 9. Risks
- Push looks available but isn't delivering. Nobody should treat it as a lane yet.
- Staff rely only on email plus the bell. That's fine, but it's slow when the app is closed.
- The old email backlog clutters the monitor.
- Placeholder Wi-Fi and emergency number are still saved, and the welcome sheet is empty.
- The Smoke Test booking is still on Superior Twin 8.

## 10. Recommended next moves (later, not now)
1. Run the `send-push` key health check, then test one device: Max's Android or desktop Chrome.
2. Put a small "Ops Alerts" enable button back in staff Settings, reusing `PushNotificationToggle` and listing devices from `push_subscriptions`.
3. On /guest, show the iPhone "Add to Home Screen, then enable Stay Alerts" step next to the existing prompt, reusing the `PWAInstallBanner` logic.
4. Detect in-app browsers and suggest "Open in Safari/Chrome".
5. Guest Stay Alerts only for things that matter (replies, pickup, ID replacement, payment action, arrival). Nothing marketing.
6. Mark the old pending/failed emails as historical on the monitor.

## Files to inspect next
`src/hooks/usePushNotifications.ts`, `src/components/PushNotificationToggle.tsx`, `src/components/GuestStayUpdatesPrompt.tsx`, `src/components/PWAInstallBanner.tsx`, `src/components/monitoring/PushHealth.tsx`, `src/components/VapidKeySettings.tsx`, `supabase/functions/send-push`, `create-notification`, `emit-admin-alert`, `notify-guest-message`, and the tables `push_subscriptions`, `push_delivery_log`, `notifications`, `admin_alert_log`, `email_send_log`.
