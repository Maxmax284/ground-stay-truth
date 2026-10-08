# Communications Spine Audit (read-only, Twilio/WhatsApp excluded)

Nothing was edited, deployed, sent or changed. All evidence comes from code reads and read-only database queries made on 8 Oct 2026.

## 1. Verified implemented

| Principle | Evidence |
|---|---|
| One thread per booking | `messages.booking_id` is NOT NULL. 79 messages exist and 0 have no booking, so there are no orphan chats. |
| Staff-only notes | `messages.is_internal` and `draft` flags. The guest SELECT policy filters on `is_internal = false AND draft = false`. |
| Guest replies scoped to their own booking | The guest INSERT policy requires `sender_id = auth.uid()`, the booking to belong to that guest, and `is_internal = false`. |
| Staff access | SELECT uses `has_ops_read`. INSERT/UPDATE use `has_ops_write`. Admins have ALL. |
| Draft then approval | `messages.draft` and `approved_by` columns. `useAIDrafts` and `ai_action_drafts` hold drafts until a human approves them. |
| Guest email tied to the recipient | `notify-guest-message` builds the key as `guest-msg-${message.id}-${email}`, which follows the recipient-scoped key rule. |
| Incoming chat can't change bookings | `messaging-router` line 6 says "Capture-only: never mutates bookings, payments". Its prompt (around line 405) forbids changing bookings or payments. Its only booking queries are `.select` reads. |
| Message source tracking | `messages.source` and `external_ref` columns. |
| Staff inbox, Chase List, ops brief | `src/pages/Messages.tsx`, `src/components/front-desk/ChaseList.tsx`, `src/hooks/useGuestInboxSummary.ts`, `_shared/opsBrief.ts`. |
| Email is the main channel | 83 emails in the last 7 days. 3 were not sent, all `admin_alert_generic` with status `suppressed`, meaning blocked on purpose. |

## 2. Partially implemented

- **Phone (push) alerts exist in code but nobody receives them.** The pieces are there: `usePushNotifications.ts`, `public/sw-push.js`, `send-push`, and `push_subscriptions`. But `push_subscriptions` has 0 rows and `push_delivery_log` has had 0 rows in the last 7 days. No phone has signed up for alerts.
- **App background worker: preview behaviour is unconfirmed.** `src/main.tsx` registers `/sw.js` (around lines 27–50). I didn't confirm that it skips the Lovable preview or iframes, as the app-install rules require.
- **Duplicate protection on guest emails has a gap.** If the message id is missing, `notify-guest-message` falls back to `crypto.randomUUID()`. A retry then gets a new key and can send a second email.
- **Camp notices.** Notice delivery to guests lives in GuestPortal and notifications. I did not trace whether notices fan out with a per-recipient key.

## 3. Untested

- Push delivery from start to finish on iPhone (only works once the app is on the Home Screen, iOS 16.4+), Android and desktop. Nothing has ever been delivered.
- What happens when a reply arrives on a cancelled or completed booking.
- Retries and backoff in `send-scheduled-emails` when the email service fails.
- Live updates of the staff inbox while a phone app is in the background.

## 4. Missing

- No database check stops a guest from changing staff messages (see P0 below).
- No dashboard showing alert delivery health: emails vs pushes per recipient, failures over time.
- No automated tests for the message permission rules or the duplicate-protection keys.

## 5. Risks, by priority

**P0**
1. **Guests can edit message text.** The policy "Guests can update own messages read status" covers every column, not just `read_at`. A guest could rewrite the text of a staff reply on their own booking, which corrupts the audit trail. Fix: a database guard that lets guests change `read_at` only.

**P1**
2. **Phone alerts reach no one** (0 sign-ups). Staff may think they're covered when they aren't. Email still works as the backup.
3. **Retries can send duplicate emails** because of the random fallback key.
4. **The background worker may run inside the preview**, which can show a stale screen.
5. **Staff can edit or approve drafts too broadly.** Anyone with `has_ops_write` can UPDATE any message, including `draft` and `approved_by`. The rule that non-admin drafts need admin review isn't enforced in the database.

**P2**
6. No delivery health dashboard.
7. Notice fan-out keys aren't verified.
8. No tests for the permission rules.

## 6. Test matrix

| Case | iPhone (installed app) | Android (installed app) | Desktop browser |
|---|---|---|---|
| Guest sends a reply and it shows in the staff inbox | yes | yes | yes |
| Staff reply reaches the guest portal and email | yes | yes | yes |
| A note marked internal never shows to the guest | yes | yes | yes |
| Turn on phone alerts, then get a test push | Home Screen only, iOS 16.4+ | yes | yes |
| Retrying the same message sends one email | n/a (server) | n/a (server) | n/a (server) |
| Guest tries to edit a staff message and is blocked | yes | yes | yes |
| Notice reaches each guest exactly once | yes | yes | yes |
| Preview shows no stale screen | n/a | n/a | yes |

All tests run on a practice (sandbox) property with test accounts, never on live guests.

## 7. Rollback

- Every change ships as one separate, reversible database change or code change.
- The guest-edit guard can be removed with a single matching undo.
- Push and duplicate-protection fixes are in server functions; redeploying the previous version undoes them.
- Message history is never deleted or rewritten.

## 8. Hardening plan (needs your approval before any work)

1. **Phase A (P0):** a database guard so guests can change only `read_at`, plus a test proving guests can't edit messages.
2. **Phase B (P1):**
   - Make duplicate protection depend on the message itself, with no random fallback.
   - Confirm or add the preview guard on the background worker.
   - Allow only admins to set `approved_by` and clear `draft`.
3. **Phase C (P1):** sign Maxwell's phone up for alerts and run one test push on iPhone, Android and desktop.
4. **Phase D (P2):** delivery health view, notice fan-out audit, permission tests.

## Technical notes

- Tables involved: `messages`, `notifications`, `push_subscriptions`, `push_delivery_log`, `email_send_log`, `messaging_chat_bindings`, `ai_action_drafts`.
- Server functions involved: `notify-guest-message`, `send-push`, `send-scheduled-emails`, `messaging-router`, `create-notification`, `emit-admin-alert`.
