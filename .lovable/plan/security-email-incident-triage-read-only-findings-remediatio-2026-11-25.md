# Security + email incident triage (read-only findings, remediation proposal)

## A. Reported hardcoded alert/push token in a migration

Confirmed
- No migration file in supabase/migrations or drizzle/migrations contains a literal internal token. Scan of current files and full git history (`git log -p --all`) for 32+/64-char hex tokens and `x-internal-token: '<literal>'` patterns returned zero hits.
- drizzle/migrations/0043_security_hardening (line ~62) mints the token server-side with `encode(gen_random_bytes(32),'hex')` - the value is generated inside the database, never written into the file.
- 0043 (line ~70) and 0045_restore_scheduled_guest_emails.sql (line 6) build the cron header by reading `cron_internal_token` from integration_secrets at run time. Only the public anon key appears, which is public by design and not proof of identity (supabase/functions/_shared/internalAuth.ts).

Unknown
- Which repo/commit/line the researcher cites. Possible explanations: an older public fork or mirror, a different project, or they mistook the anon key / the `gen_random_bytes` call for a secret.
- Scheduler job contents: the read-only role can't access cron.job, so the stored job headers couldn't be inspected directly.
- Whether the live token was ever logged: function logs show no token values, but retention is short.

Privilege scope if a token did leak: it would let someone call the cron-guarded functions (scheduled emails, push, emit-admin-alert, poll-flights, etc.) as "internal". Possible impact: spam alerts/emails/push, or wasted AI/flight budget. It does not grant database admin, service-role, or payment access.

Severity: unconfirmed. Treat as High until the researcher's link is checked.

## B. Critical "guest confirmation email failed" alert, Nov 25 08:47 Bangkok

Confirmed (redacted)
- Email log: 01:47:17Z `sent` to g2p1…@gmail.com (message_id from notify.lmtcampstay.com), then 01:47:18Z `bounced`.
- admin_alert_log: 3 `guest_email_failed` critical alerts at 01:47:26Z (one per admin inbox fan-out), triggered_by=system, is_test=false, no booking_id attached, retry_count 0.
- It's a real bounce, not fabricated test data. The address looks machine-generated, so it's likely a typo or throwaway address that Gmail rejected.
- 6 guest_email_failed alerts in 14 days (Nov 20 to Nov 25). This is low volume and unrelated to the token: the send was accepted and authenticated fine, and the recipient's mailbox refused it.
- No guest profile matches this email, so the booking probably stores it only as a manual guest contact.

Unknown: the bounce sub-reason (hard vs. mailbox full) and which booking it was; the alert row has no booking_id. No resend or booking change was made.

Severity: Low (single bad address). Ops follow-up: Nikki should get a correct email from the guest.

## Remediation sequence (needs approval)
1. Get the exact URL/commit from the researcher and verify it. Do not test the token against production.
2. Rotate `cron_internal_token` regardless, as a precaution. Write a new random value in integration_secrets in one transaction. Cron reads it at run time, so jobs pick it up on their next tick with no gap in alert coverage. Then confirm the next hourly run of send-scheduled-emails, poll-flights and the watchdog returns 200.
3. Make internalAuth compare tokens in constant time and log only the caller type (never the value).
4. Run the security scan and a secret scan (gitleaks) on the public repo. If the repo exposes history you didn't intend to share, make it private.
5. Email: attach booking_id to guest_email_failed alerts. Include the bounce type in the alert. Suppress repeat alerts for an address that's already on the suppression list.
6. Review edge function logs for unusual calls carrying an internal token. Look for volume spikes on send-push and emit-admin-alert over the past 14 days.
