
# Vanta Integration Session — GTH side, inbound-only

GTH sends signed signals to Vanta. Vanta drafts. A human approves there. Nothing in GTH executes because of this integration. No callbacks in this pass — the settings page shows callback mode as **None (inbound only)** with a "coming later" note, so the doctrine is visible but no execution surface exists.

## What gets built

### 1. New DB tables (one migration)

- `vanta_integration_session` (single-row, admin-only)
  - `id`, `platform_key = 'ground_truth_hub'`, `platform_name`, `environment` (`sandbox` | `production`)
  - `vanta_webhook_url`, `source_id`, `enabled bool`, `status text`
  - `shared_secret_configured bool` (mirror of the secret existing in `integration_secrets`)
  - `callback_mode text default 'none'`
  - `allowed_events jsonb` (array of event-type strings)
  - `last_event_sent_at`, `last_success_at`, `last_failure_at`, `failure_count int`, `last_error_summary text`
  - `created_at`, `updated_at`, `updated_by`
- `vanta_event_log`
  - `id`, `event_id` (uuid, unique), `event_type`, `direction default 'outbound_to_vanta'`, `status` (`queued|sent|accepted|rejected|failed|retrying|paused`)
  - `payload_summary jsonb` (NOT full payload — small fields only, PII-masked)
  - `idempotency_key text unique`, `sent_at`, `accepted_at`, `failed_at`, `retry_count int`, `vanta_response_code int`, `error_summary text`, `created_at`
- GRANTs: `authenticated` SELECT only; `service_role` ALL. RLS: admin-only SELECT via `has_role(auth.uid(),'admin')`. Writes go through edge functions with service role.
- Retention: log purge job (reuse `cleanup-retention` pattern) trims `vanta_event_log` to 90 days.

### 2. Secret storage

- Shared secret stored as `VANTA_WEBHOOK_SECRET` via `integration_secrets` (existing pattern, reuses `manage-integration-secret` function + `useIntegrationSecrets` hook). Never returned to the browser.
- URL + source_id stored in the table (not secret).

### 3. Edge functions

- `vanta-dispatch` (internal): builds the signed envelope, POSTs to `vanta_webhook_url`, writes to `vanta_event_log`, handles retry/backoff (network + 5xx only, max 3, exponential), skips on `enabled=false` or kill-switch paused, dedupes on `idempotency_key`. HMAC-SHA256 over `${timestamp}.${body}` with `VANTA_WEBHOOK_SECRET`. Headers: `X-Vanta-Signature`, `X-Vanta-Timestamp`, `X-Vanta-Source`, `X-Vanta-Event-Id`.
- `vanta-test-event`: admin-only, JWT-validated. Sends `integration.test` envelope, returns Vanta's response code + body summary. Marked `test: true` in payload.
- `vanta-emit` (internal trigger target): tiny wrapper invoked by DB triggers / existing edge functions; forwards to `vanta-dispatch`.

### 4. Event sources wired (first batch)

- **Bookings**: DB trigger `AFTER INSERT OR UPDATE OF state ON bookings` → `pg_net` call to `vanta-emit` with `booking.created` / `booking.state_changed`. Payload summary: `booking_id`, `unit_id`, `check_in`, `check_out`, `state`, `previous_state`. No guest PII beyond `guest_id` (UUID).
- **Guest messages / requests**: hook into existing message-insert path (whichever edge function or trigger handles `messages` / `guest_requests`) → emit `guest_message.received` / `guest_request.created` with `id`, `booking_id`, `channel`, truncated `preview` (first 120 chars).
- **Payments**: extend `payment-webhook` success/failure branches to fire `payment.received` / `payment.failed` with `payment_id`, `booking_id`, `amount`, `currency`, `status`.

Each emit site checks `enabled = true` and event-type is in `allowed_events` before dispatch. Failure of Vanta send NEVER fails the business operation — wrap in try/catch, log to `vanta_event_log`, move on.

### 5. UI: `src/pages/VantaIntegration.tsx` + route under Settings

New tab in `src/pages/Settings.tsx` (admin-only), label "Vanta". Page sections:

- **Header** — title, doctrine subtitle: *"This platform sends signals to Vanta. Vanta turns them into drafts. Nothing executes without approval."*
- **Status panel** — current `status`, environment badge, enabled/paused, last success / last failure / failure count, last error.
- **Connection** — Vanta webhook URL (editable), Source ID, Environment select (`sandbox` / `production` with confirm dialog when flipping to production), Shared secret status ("Configured" / "Missing") with "Set secret" button (reuses `useSetSecret`), "Rotate secret" button.
- **Allowed events** — checklist of: `booking.created`, `booking.state_changed`, `guest_message.received`, `guest_request.created`, `payment.received`, `payment.failed`, `integration.test`. Each row has a sensitivity tag where relevant.
- **Callbacks** — read-only card: *"Callback mode: None (inbound only). Approved callbacks will be added in a later pass."*
- **Controls** — Send Test Event, Pause Sync (kill switch toggle on `enabled`), Disconnect (clears URL + disables, keeps logs).
- **Logs** — last 50 rows from `vanta_event_log`: event id, type, status, sent_at, response code, error. Collapsible "Advanced".

Copy is plain English. No "orchestration mesh" anything.

### 6. Access control

- Settings tab gated by `role === 'admin'` (matches `Integrations` tab pattern in `Settings.tsx`).
- All edge functions validate JWT + `has_role(user, 'admin')` for config/test actions. Emit functions are service-role-only, called from triggers or trusted edge functions.

### 7. Doctrine guards baked in

- No code path lets a Vanta response mutate GTH state.
- No callback routes exist in this pass.
- All sends are best-effort; business writes always win.
- Secrets never reach the browser.
- Test event is clearly tagged `test: true` and never touches business tables.

## Files touched

**New**
- `supabase/migrations/<ts>_vanta_integration_session.sql`
- `supabase/functions/vanta-dispatch/index.ts`
- `supabase/functions/vanta-test-event/index.ts`
- `supabase/functions/vanta-emit/index.ts`
- `src/pages/VantaIntegration.tsx`
- `src/components/VantaIntegrationPanel.tsx` (the actual settings UI; page is a thin wrapper if needed, or rendered as a Settings tab)
- `src/hooks/useVantaIntegration.ts`
- `src/lib/vanta/events.ts` (event-type constants, payload-summary builders)

**Modified**
- `src/pages/Settings.tsx` — add admin-only "Vanta" tab
- `supabase/functions/payment-webhook/index.ts` — fire `payment.received` / `payment.failed`
- Whatever function/trigger inserts guest messages/requests — add Vanta emit
- `supabase/functions/cleanup-retention/index.ts` — add `vanta_event_log` 90-day purge

**Out of scope (deferred)**
- Callback endpoints + signed-token verification
- Wiring Fenrir/CampCore/Website sources (this is the GTH side only)
- Sandbox vs production split-secrets (single secret for now; switch is just a label + payload flag)

## Acceptance

1. Admin sees a "Vanta" tab in Settings; non-admins do not.
2. Admin can set webhook URL, source ID, environment, and the `VANTA_WEBHOOK_SECRET` secret.
3. Admin can toggle allowed events.
4. "Send Test Event" hits the configured URL with a signed `integration.test` envelope and shows the response.
5. Kill switch (`enabled=false`) stops all outbound sends within one request cycle.
6. Bookings, guest messages/requests, and payment success/failure produce signed events with `event_id` + `idempotency_key`, logged in `vanta_event_log`.
7. A Vanta outage never breaks a booking, message, or payment in GTH.
8. Secrets never appear in any browser response.
9. No callback routes exist.

Ready to switch to build mode and ship this when you give the word.
