# LMT CampStay — Backend Architecture

> Straight talk for the next dev who inherits this thing. No PhD required.
> If you're licensing this platform for another property or gym, read the
> "Safe / unsafe to customize" section before you touch anything.

---

## 1. What this platform actually is

LMT CampStay (formerly GroundStay) is a hospitality operations platform. It
runs the real-world booking, guest, payment, and staff workflows for **Lamai
Muay Thai** in Koh Samui, Thailand. It is designed to be licensable to other
accommodation businesses — but the core booking/payment/guest lifecycle is
generic; the branding, training-package overlay, and a handful of policy
defaults are LMT-specific.

**Frontend:** React 18 + Vite + Tailwind + shadcn (single-page app, PWA-ready).
**Backend:** Supabase (Postgres + RLS + Storage + Edge Functions on Deno).
**Payments:** Stripe (Checkout Sessions + webhooks).
**Messaging capture:** LINE, Telegram, WhatsApp (Meta Cloud API), Twilio SMS.
**AI:** Lovable AI Gateway (Gemini/GPT via `LOVABLE_API_KEY`).
**Security event bus:** Fenrir Lock (outbound only, one-way).
**Operational signal bus:** Vanta (outbound signals, calm ops AI on the other side).

**Golden rule that shapes everything:**
> *Messaging feeds the system, it doesn't control it.*
> Chat channels capture intent → surface as drafts inside the platform →
> nothing executes from chat. Plan → Approve → Execute always happens in-app.

---

## 2. High-level system map

```text
                       ┌──────────────────────────────────┐
   Guests / Staff ───▶ │ React SPA (src/)                 │ ◀── PWA install
                       │  - Guest portal                  │
                       │  - Staff dashboard / calendar    │
                       │  - Admin controls                │
                       └───────────────┬──────────────────┘
                                       │ supabase-js
                       ┌───────────────▼──────────────────┐
                       │ Supabase Postgres                │
                       │  - Tables + RLS (source of truth)│
                       │  - Triggers (auto-obligations,   │
                       │    overlap check, audit)         │
                       │  - Security-definer functions    │
                       └───┬───────────┬───────────┬──────┘
                           │           │           │
             ┌─────────────▼──┐ ┌──────▼──────┐ ┌──▼───────────┐
             │ Edge Functions │ │ pg triggers │ │ Storage      │
             │ (Deno)         │ │ emit_vanta_ │ │ guest-docs,  │
             │  - payments    │ │  signal etc │ │ unit-photos, │
             │  - messaging   │ └─────────────┘ │ invoices     │
             │  - AI, ops     │                 └──────────────┘
             │  - cron/jobs   │
             └──┬──────┬──────┴──────────────┐
                │      │                     │
        ┌───────▼┐  ┌──▼────────┐   ┌────────▼────────┐
        │ Stripe │  │ Messaging │   │ Vanta / Fenrir  │
        │        │  │ providers │   │ (outbound only) │
        └────────┘  └───────────┘   └─────────────────┘
```

---

## 3. Booking lifecycle — the spine of the whole thing

Bookings drive everything: calendar, obligations, guest portal, arrival journey,
housekeeping, messaging notifications. Nine states, defined once in
`src/lib/bookingStateMachine.ts` and enforced at the DB level.

```text
   inquiry ──────┐
   soft_hold ────┼──▶ pending_deposit ──▶ confirmed ──▶ checked_in ──▶ completed
   pending_approval ┘                          │
                                               ├──▶ cancelled
                                               └──▶ no_show
```

- **`BLOCKING_STATES`** in `bookingStateMachine.ts` is the single source of truth
  for "does this booking hold the dates?" Every surface that answers that
  question must use it: the DB `check_booking_overlap()` trigger, the
  `auto-assign-unit` and `get-availability` edge functions, and the booking
  form's local pre-check.
- **`STATE_TRANSITIONS`** is the allowed graph. Admin override lives in
  `getAllTransitions()`.
- **Every state change is logged** to `booking_state_log` (append-only) with
  actor, reason, and monotonic `seq` for audit.
- **Overlap protection is enforced twice** — trigger `check_booking_overlap`
  raises `23P01` on any attempt to write an overlapping blocking booking; the
  UI pre-checks so the user gets a friendly error instead of a raw exception.

**BUSINESS-CRITICAL:** never add a blocking state without adding it to both
`BLOCKING_STATES` and the trigger, and never remove one without a migration
that clears stale rows.

---

## 4. Payment lifecycle

Payments in this system are **obligations first, transactions second.** When a
booking enters `soft_hold`, `pending_approval`, or `pending_deposit`, three
triggers may fire and create `pending` payment rows:

| Trigger                              | Creates                | Gated by                                        |
| ------------------------------------ | ---------------------- | ----------------------------------------------- |
| `auto_create_pending_deposit`        | deposit obligation     | always (default 20% of total)                   |
| `auto_create_pending_booking_fee`    | booking fee obligation | `booking_fee_enabled` policy = true, mode ≠ included |
| `auto_create_pending_security_deposit` | security deposit     | `security_deposit_required` policy = true       |

All three are idempotent (skip if a pending/recorded row already exists) and
read from `policy_settings` with property-scoped overrides.

**Payment flow (Stripe Checkout):**

```text
Staff or guest ──▶ create-payment-link ─────▶ payment_links row
                                              (signed, single-use token)
Guest opens link ─▶ guest-payment-link ──▶ Stripe Checkout Session
Stripe processes ─▶ payment-webhook ──────▶ payments.status = recorded
                                            booking_state pending_deposit → confirmed
                                            send-booking-confirmation triggered
```

**Webhook signature verification is mandatory.** See
`supabase/functions/payment-webhook/index.ts`. Never disable it.

**Reconciliation safety nets:**
- `payment-webhook-watchdog` — cron; flags webhook drought.
- `reconcile-stripe-payments` — admin-triggered sweep; hits the Stripe API for
  every `pending` payment with a `provider_session_id` in the last 30 days,
  fixes anything the webhook missed, advances booking state, sends the
  confirmation email. This is your break-glass tool.
- `payment-reconciliation` — daily cron; audit log of payment vs booking totals.

**Refunds** go through `refund-payment` which delegates the math to
`src/lib/refundCalculator.ts` (tiered cancellation policy). Refunds create a
new `payments` row with negative amount and reference the original.

**PAYMENT-CRITICAL:** payment writes are keyed by `provider_transaction_id`
and `provider_session_id` for idempotency. Do not remove those uniqueness
constraints or webhook retries will double-charge state transitions.

---

## 5. Guest lifecycle & arrival journey

`guest-arrival-journey` is a stage machine that mirrors the physical guest
experience. Stages are logged to `guest_arrival_stage_log`.

```text
booking confirmed
   └─▶ stage_1_pre_arrival     (checklist unlocked)
   └─▶ stage_2_in_transit      (flight tracked / manual "on the way")
   └─▶ stage_3_landed          (guest-landed webhook or manual)
   └─▶ stage_4_checkin_pending (auto: booking.state → checked_in)
   └─▶ stage_5_in_stay
   └─▶ stage_6_checkout_pending
   └─▶ stage_7_completed
```

Supporting pieces:
- **Airport pickup:** `airport_pickups` table + `check-flight-status`,
  `poll-flights`, `poll-airport-traffic`, `guest-landed`. Driver assignment is
  manual; the exception scanner flags pickups without a driver within 24h.
- **Pre-arrival checklist:** `pre_arrival_checklist` — TM30, ID upload,
  travel details.
- **Guest documents:** `guest_documents` + `verify-document` (AI-assisted ID
  advisory; never a hard block on its own).
- **Welcome content:** `draft-arrival-welcome` uses the AI Gateway to draft a
  location-aware welcome; staff must approve before sending.
- **Stay support:** `stay_support_log`, `maintenance_requests`,
  `laundry_requests`, `messages` — all guest-visible while in stay.
- **Reviews:** `reviews` + `notify-review-response` after checkout.

---

## 6. Authentication & role model

**Roles are in a separate table.** Never on profiles. Full stop.

```text
user_roles(user_id, role app_role)  ← RLS-locked; read via has_role()
```

`app_role` enum, ascending authority:
`guest → viewer → maintenance → front_desk → front_desk_supervisor → manager → admin`

Everything role-gated goes through the security-definer function
`public.has_role(user_id, role)`. Multi-property scoping goes through
`public.has_property_access(user_id, property_id)` + `user_property_assignments`.

**Client-side (`src/hooks/useAuth.tsx`):**
- Session subscription + role fetch with retry (mobile/PWA restore is slow).
- 30-minute inactivity auto-signout for staff (guests exempt).
- 5-strike client-side login rate limit (server-side rate limits are the real
  defense; this is UX polish).
- Emits Fenrir security events on login / login-failed / after-hours access.

**Guest vs staff portals** are split at the URL level (`/auth/guest` vs
`/auth`). Both hit the same `auth.users` table; roles branch the UI.

**SECURITY-CRITICAL:**
- Never read/write `user_roles` from client code without RLS review.
- Never trust client-supplied role/property claims. Always re-derive server-side.
- Never store secrets in `policy_settings.value` — that table is admin-readable.
  Secrets live in `integration_secrets` (service-role read only).

---

## 7. Row Level Security model (short version)

Every public table has RLS enabled. Every `CREATE TABLE` migration in this
project pairs with explicit `GRANT`s (the Data API does not grant defaults).

Common policy patterns:
- **Guest-owned rows** (own bookings, own documents, own messages): `guest_id = auth.uid()`.
- **Property-scoped staff rows:** `has_property_access(auth.uid(), property_id)`.
- **Role-gated rows:** `has_role(auth.uid(), 'admin' | 'manager' | ...)`.
- **Public anon reads** (limited): `/stay` unit listing, featured
  `local_recommendations`, active `properties`. Nothing PII.
- **Service-role only:** `integration_secrets`, `payment_events` raw payloads,
  `security_events` writes.

The `has_role` and `has_property_access` functions are `SECURITY DEFINER` to
sidestep recursive RLS on `user_roles` — do not change that.

---

## 8. External integrations

| System        | Direction | Entry point                                 | Secret name                     |
| ------------- | --------- | ------------------------------------------- | ------------------------------- |
| Stripe        | ↔         | `payment-webhook`, `create-payment-link`    | `stripe_secret_key` (in `integration_secrets`) |
| LINE          | ↔         | `line-webhook`, `messaging-router`          | `line_channel_secret`, `line_channel_access_token` |
| Telegram      | ↔         | `telegram-webhook`, `telegram-poll`         | `telegram_bot_token`            |
| WhatsApp Meta | ↔         | `whatsapp-meta-webhook`                     | `whatsapp_*`                    |
| Twilio SMS    | ↔         | `twilio-webhook`                            | `twilio_*`                      |
| AviationStack | ← in      | `poll-flights`, `check-flight-status`       | `AVIATIONSTACK_API_KEY` (env)   |
| Open-Meteo    | ← in      | (client-side, weather widget)               | none (free)                     |
| Fenrir Lock   | → out     | `_shared/fenrir.ts`, `fenrir-dispatch`      | `fenrir_api_key`                |
| Vanta         | → out     | `vanta-emit`, `emit_vanta_signal()` trigger | `vanta_internal_token`          |
| Lovable AI    | ← use     | `ai-assistant`, `translate-message`, etc.   | `LOVABLE_API_KEY` (env)         |
| Web Push      | → out     | `send-push`                                 | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (env) |
| Resend        | → out     | `send-transactional-email`                  | via connector                   |

All secrets are read through `get_integration_secret()` (security-definer) or
`Deno.env.get()`. **Never** hardcode or log them.

---

## 9. Scheduled jobs (cron)

Configured in Supabase pg_cron:

| Job                           | Frequency | What it does                                                |
| ----------------------------- | --------- | ----------------------------------------------------------- |
| `expire-stale-bookings`       | hourly    | Cancels `soft_hold` / `pending_deposit` past their TTL      |
| `payment-webhook-watchdog`    | 15 min    | Flags webhook drought; alerts if Stripe stopped calling     |
| `payment-reconciliation`      | daily     | Cross-checks payment totals vs booking totals               |
| `poll-flights`                | 15 min    | Refreshes `flight_tracking` for upcoming arrivals           |
| `poll-airport-traffic`        | hourly    | BKK/USM ambient traffic snapshot                            |
| `send-scheduled-emails`       | hourly    | Pre-arrival, welcome, review-request drips                  |
| `cleanup-retention`           | daily     | 90-day PII purge per PDPA/GDPR                              |
| `cleanup-storage`             | daily     | Orphaned files in storage buckets                           |
| `daily-briefing`              | daily     | Auto staff digest                                           |
| `ai-budget-watchdog`          | 15 min    | Tracks monthly AI spend, fires 75/90/100% alerts            |
| `account-census`              | daily     | Observational role/user snapshot                            |

If a cron function starts failing, `get_ops_service_health()` will show it in
the Ops Control Tower.

---

## 10. Security & audit

- **`staff_audit_events`** — every meaningful admin/staff action.
  `log_staff_audit_event()` is the canonical writer.
- **`booking_state_log`** — every booking state transition.
- **`payment_link_events`** — every payment link lifecycle event (created,
  clicked, revoked, abuse-locked).
- **`security_events`** — Fenrir-shaped outbound + local audit copy.
- **`profile_audit_log`** — PII changes to profiles.
- **`policy_settings_history`** — every policy tweak with old/new values.
- **`recovery_snapshots`** — admin-only, whole-config point-in-time snapshot;
  restore via `disaster/recovery` page.

Fail-closed defaults: any function that can't determine the caller's role
returns 403. The `_shared/aiGuard.ts` sits in front of AI calls to enforce
budget + rate limits.

---

## 11. Safe / unsafe to customize (for future licensees)

**Core platform logic — DO NOT fork unless you know what you're doing:**
- `src/lib/bookingStateMachine.ts` (state graph + BLOCKING_STATES)
- `src/lib/permissions.ts` (role hierarchy)
- `supabase/functions/payment-webhook/*`
- `supabase/functions/_shared/*`
- All DB triggers on `bookings` and `payments`
- `has_role`, `has_property_access`, `check_booking_overlap`, `assign_unit_for_group`

**LMT CampStay–specific configuration (safe to swap per tenant):**
- `policy_settings` rows (deposit %, booking fee %, security deposit amount,
  cleaning buffer, currency, VAT rate)
- `properties`, `units`, `unit_groups` inventory
- `training_packages` (Lamai Muay Thai overlay — remove for non-gym tenants)
- Landing page copy in `src/pages/LandingPage.tsx` + `src/components/landing/*`
- i18n JSON in `src/i18n/locales/*.json`
- Brand assets in `src/assets/`

**Lamai Muay Thai branding — always customize per tenant:**
- Logo, tray icon, color tokens in `src/index.css`
- The "Camp Ready" / "Built From Inside" narrative components
- `booking_training_links` and the training-package UI on booking detail

**Safe extension points:**
- New edge functions (add to `supabase/config.toml` with `verify_jwt` decision)
- New messaging channels (implement in `messaging-router`)
- New AI providers (behind `_shared/aiGuard`)
- New payment providers (implement adapter, keep the same
  obligation-then-transaction pattern)
- New policy keys (add to `policy_settings` + read via `policy_settings.key`)

**Unsafe without deep testing:**
- Anything that touches the booking overlap trigger
- Anything that shortcuts `booking_state_log`
- Payment idempotency keys
- RLS on `user_roles`, `integration_secrets`, `payment_events`
- The Vanta signal emitter trigger (silently rate-limits; noisy failures could
  DoS the outbound webhook)

---

## 12. Known operational dependencies

- **Time:** UI is `Asia/Bangkok`; storage is UTC. See `src/lib/timezone.ts`.
- **Currency:** Thai Baht (฿), 7% VAT. Central formatter in `src/lib/currency.ts`.
- **Connectivity:** Some staff work from phones with spotty signal. PWA caches
  aggressively; the sw + `NetworkFirst` policy is intentional.
- **AviationStack quota:** Free-tier limits; `poll-flights` batches calls and
  falls back to manual entry.
- **Stripe webhook:** If it stalls, `reconcile-stripe-payments` is the manual
  fix; watchdog will alert you.

---

## 13. If you're stuck, start here

1. `src/lib/bookingStateMachine.ts` — how bookings move.
2. `supabase/functions/payment-webhook/index.ts` — how money is confirmed.
3. `supabase/functions/get-availability/index.ts` — how the calendar decides
   what's bookable.
4. `src/lib/permissions.ts` + `useAuth.tsx` — who can do what.
5. This document + `docs/backend-component-map.md`.

If any of the above is out of sync with the code, **fix the code or fix the
doc — don't leave the gap.**
