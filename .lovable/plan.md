## Audit Summary (what already exists)

**Admin surfaces** (all admin-gated via `canAccessRoute`/`permissions`):
- `/monitoring` (`MonitoringCenter.tsx`) — plain-English alerts feed (payments, email, webhooks, notifications). Closest existing analog to what you're asking for.
- `/security-center` (`SecurityCenter.tsx`) — Compliance/GDPR/audit.
- `/disaster-recovery` — Snapshots/restore.
- `/front-desk` — staff workflow (do NOT duplicate).
- `/dashboard` (`Index.tsx`) — Command Center root.

**Booking + state** — `bookings`, `booking_state_log`, `bookingStateMachine.ts`, `BookingDetailSheet`, `travelState.ts`, `operationalStatus.ts`. Authoritative — reuse, don't touch.

**Payments** — `payments` (with `payment_type`, `status`), `payment_events`, `payment_links`, `payment_link_events`, `payment_reconciliation_log`, `webhook_health` table (already tracks `last_received_at` / `last_success_at` / `last_failure_at` / `status` per provider). `payment-webhook`, `reconcile-stripe-payments`, `payment-webhook-watchdog` edge fns.

**Travel/pickup/flight** — `airport_pickups`, `flight_tracking`, `airport_traffic`, `guest_arrival_stage_log`, `poll-flights`, `check-flight-status`, `useAirportPickups`, `useFlightTracking`, `usePickupFlightsFallback`.

**Messaging** — `messages`, `messaging_inbound_log`, `messaging_notification_log`, `messaging_chat_bindings`, plus LINE/Telegram/WhatsApp/Twilio webhooks. Delivery outcomes already land in `messaging_notification_log`.

**Email** — `email_send_log` (deduped by `message_id`), plus legacy `email_log`. `send-transactional-email` is the single sender.

**Notifications/portal** — `notifications`, `push_subscriptions`, `pre_arrival_checklist`, `guest_arrival_stage_log`, `useNotifications`.

**Housekeeping** — `housekeeping_tasks` (auto-created by `auto_create_housekeeping_task` trigger on completed booking).

**Audit/events** — `staff_audit_events` + `log_staff_audit_event()` RPC, `recovery_audit_log`, `booking_state_log`, `payment_events`, `payment_link_events`, `guest_arrival_stage_log`, `vanta_event_log`. No unified `operation_id`, but timestamps + booking_id are enough.

**Cron/health** — 13 pg_cron jobs, `webhook_health` table, edge fns `payment-webhook-watchdog`, `payment-reconciliation`, `ai-budget-watchdog`.

**Gaps (no data source yet)**:
- No unified "service health" table — only `webhook_health` exists. Other services have to be derived from log freshness.
- No cron job heartbeat table — pg_cron run results live in `cron.job_run_details` (queryable but admin-only).
- No "guest opened portal" event.
- No "driver acknowledged pickup" field beyond `airport_pickups.driver_id` assignment.

**Do NOT touch**: state machine, Front Desk, booking mutation paths, payment webhook, RLS on `bookings`/`payments`.

---

## Proposed Location

New admin-only route: **`/ops-control-tower`** — added to sidebar under the existing Admin section, label **"Ops Control Tower"**, icon `Radar` or `Activity`. Permission: `admin` only (extend `NAV_ACCESS` in `permissions.ts`).

Keep `/monitoring` as-is (alerts feed). Ops Control Tower is the deeper systems view.

---

## UI Layout

Single page, tabbed:

```
┌─ Ops Control Tower ──────────────────────────────────┐
│ [Systems Health] [Transit Monitor] [Exceptions]      │
│ [Systems Matrix] [Transit Board] [Verification]      │
└──────────────────────────────────────────────────────┘
```

Each tab is its own lazy panel. Per-booking timeline opens as a side sheet (reuses `BookingDetailSheet` pattern) from any row.

---

## Status Model (deterministic only)

```ts
type ServiceStatus = "healthy" | "warning" | "broken" | "unknown" | "not_configured" | "pending";

interface ServiceProbe {
  key: string;              // 'stripe_webhook', 'email', 'flight_api', ...
  label: string;
  status: ServiceStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  source: string;           // which table/edge fn this came from
  retryable: boolean;
}
```

Rules: `healthy` if last success < threshold AND no failure since. `warning` if no activity in threshold window. `broken` if last event is a failure. `not_configured` if integration secret missing. **Never AI-derived.**

Service → source mapping (already-available):
| Service | Source |
|---|---|
| Stripe webhook | `webhook_health` where provider='stripe' |
| Payment link gen | `payment_links` recent + `payment_link_events` errors |
| Email delivery | `email_send_log` dedup latest by `message_id` |
| WhatsApp/LINE/Telegram | `messaging_notification_log` |
| Flight API | `flight_tracking.last_checked_at` + error fields |
| Booking state machine | `booking_state_log` write freshness |
| Payment obligations | `payments` pending older than X with no link |
| Housekeeping turnover | `housekeeping_tasks` created vs `bookings` completed |
| Notifications | `notifications` insert freshness |
| Audit log writes | `staff_audit_events` freshness |
| Cron | `cron.job_run_details` (admin RPC) |
| Storage | `guest_documents` write freshness + bucket probe |
| AI drafts | `ai_usage_events` freshness |

For anything with no source: show **"Not configured"** + a one-liner saying what table/event would need to exist.

---

## Phased Plan

**Phase 1** (this round if you approve):
1. Add `/ops-control-tower` route + admin-only nav entry.
2. New SQL function `public.get_ops_service_health()` (SECURITY DEFINER, admin-only) that returns the `ServiceProbe[]` derived from the tables above. No new tables.
3. `OpsControlTower.tsx` page with three working tabs:
   - **Systems Health**: cards from `get_ops_service_health()`.
   - **Transit Monitor**: reuses `useAirportPickups` + `useFrontDesk` for arrivals ±72h; read-only rows with "Open Booking" → existing `BookingDetailSheet`.
   - **Exceptions**: deterministic queue from a `get_ops_exceptions()` SQL fn (deposit-paid-but-state-mismatch, pickup-no-driver, missing-docs-before-arrival, link-without-portal-notification, etc.).
4. No state mutations. No new guest-facing messages.

**Phase 2**:
- Per-booking Operational Timeline side-sheet — unions `booking_state_log`, `payment_events`, `payment_link_events`, `messaging_notification_log`, `email_send_log`, `guest_arrival_stage_log`, `staff_audit_events`, `housekeeping_tasks`, `flight_tracking` by `booking_id` and orders by `created_at`. Filter chips by category.
- Systems Matrix view (bookings × services grid using same probes).
- Transit Board (airport-style table).

**Phase 3**:
- Safe verification center: dry-run buttons that only call existing health/echo edge fns. Stripe = read-only `webhook_health` ping. Email = enqueue to admin's own address only. Messaging tests = `messaging-system-ping` (already exists). All test calls logged to `staff_audit_events`.

**Phase 4** (optional):
- AI narrative on top of deterministic probes — labeled "Summary, not source of truth". Reuses existing AI gateway.

---

## Save for Tomorrow
- Email migration (Resend → Lovable Email) — you flagged this.
- Phase 3 verification center (after Phase 1+2 land).
- Phase 4 AI narrative.
- New event types for "guest opened portal" and "driver acknowledged pickup" — Phase 2 will surface these as `not_configured` until added.

---

## Risks / Do-Not-Touch
- Booking state machine, Front Desk, payment webhook, RLS — read-only access only.
- New SQL functions: SECURITY DEFINER + `has_role(auth.uid(),'admin')` gate inside the function body. No new GRANT on tables.
- No destructive tests. Phase 3 dry-runs only.
- Honest "not_configured" rather than fabricated greens.

---

## Tonight's ask

Approve **Phase 1** scope above and I'll build it: route + nav + 2 SQL functions + page with 3 read-only tabs. Everything else queues for tomorrow.
