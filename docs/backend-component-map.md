# LMT CampStay — Backend Component Map

> Plain-English index of every backend folder, file, and DB object.
> Read alongside `docs/backend-architecture.md`.
>
> **C** = Core platform (don't fork lightly)
> **L** = LMT CampStay–specific config (safe to swap per tenant)
> **B** = Branding / Lamai Muay Thai (always customize per tenant)

---

## Edge functions — `supabase/functions/`

### Payment & booking money flow (all **C**)
| Function                       | What it does                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `payment-webhook`              | Stripe webhook receiver. Verifies signature, records payment, advances booking `pending_deposit → confirmed`, fires confirmation email. **PAYMENT-CRITICAL.** |
| `process-payment`              | Server-side payment recording for offline/cash/bank transfer methods.        |
| `create-payment-link`          | Staff-generated Stripe Checkout link; signed single-use token in `payment_links`. |
| `guest-payment-link`           | Guest-facing endpoint that consumes a payment link and mints a Stripe session. |
| `refund-payment`               | Admin/manager refund flow; math from `refundCalculator.ts`; negative `payments` row. |
| `payment-reconciliation`       | Daily audit — payment totals vs booking totals.                              |
| `payment-webhook-watchdog`     | Cron alarm — flags Stripe webhook drought.                                   |
| `reconcile-stripe-payments`    | Admin break-glass sweep — walks pending Stripe sessions, fixes anything the webhook missed. |
| `generate-tax-invoice`         | Thai 7% VAT compliant invoice PDF → `tax-invoices` bucket.                   |
| `expire-stale-bookings`        | Cron — cancels stale `soft_hold` / `pending_deposit` past TTL.               |
| `send-booking-confirmation`    | Post-confirmation email + notification bundle.                               |

### Availability & inventory (all **C**)
| Function                | What it does                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `get-availability`      | Public unit availability for `/stay` and booking form. Reads `listing_category`, `region`, `BLOCKING_STATES`. |
| `auto-assign-unit`      | Picks a free unit from a `unit_group` respecting the overlap rules.                 |
| `ical-export`           | Per-unit iCal feed for OTA channel managers.                                        |

### Guest lifecycle (**C**, some **L** for content)
| Function                  | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `guest-arrival-journey`   | Stage-machine driver for `guest_arrival_stage_log`.                               |
| `guest-landed`            | Marks a booking as landed; can be called manually or by flight webhook.           |
| `draft-arrival-welcome`   | AI-drafted welcome message; staff review before send. Content templates = **L**.  |
| `verify-document`         | AI-assisted ID verification advisory. Never a hard block.                         |
| `check-flight-status`     | On-demand flight lookup via AviationStack.                                        |
| `poll-flights`            | Cron — refreshes tracked upcoming arrivals.                                       |
| `poll-airport-traffic`    | Cron — BKK/USM ambient traffic.                                                   |

### Messaging bridges (all **C**; provider secrets vary per tenant)
Golden rule: capture only. Nothing executes from chat.
| Function                    | What it does                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| `messaging-router`          | Central dispatcher. Turns inbound provider messages into `messages` drafts and normalizes bindings. |
| `messaging-link`            | Generates one-time link codes so guests/staff can bind their chat account.       |
| `notify-via-messaging`      | Outbound fanout to bound users via their preferred channel.                      |
| `line-webhook`              | Inbound LINE messages + verification.                                            |
| `line-register-webhook`     | LINE webhook registration helper.                                                |
| `line-check-webhook`        | Health check for LINE binding.                                                   |
| `telegram-webhook`          | Inbound Telegram messages (webhook mode).                                        |
| `telegram-poll`             | Fallback long-polling for envs without webhook.                                  |
| `telegram-register-webhook` / `telegram-check-webhook` | Admin plumbing.                                       |
| `whatsapp-meta-webhook`     | WhatsApp Meta Cloud API inbound.                                                 |
| `twilio-webhook`            | Twilio SMS inbound.                                                              |
| `bot-identity`              | Returns bot identity per channel (name, avatar, footer).                         |
| `translate-message`         | Guest ↔ staff translation via AI Gateway.                                        |
| `admin-messaging-test`      | Admin bench for round-trip send/receive per channel.                             |
| `messaging-ping-all` / `messaging-system-ping` | Cross-channel liveness ping.                                   |

### AI & ops assistants (**C** framework, **L**/`B` for prompts)
| Function                  | What it does                                                                     |
| ------------------------- | -------------------------------------------------------------------------------- |
| `ai-assistant`             | In-app assistant ("Kru Glitch") backend. Role-aware, guardrailed.               |
| `ai-usage-summary`         | Read-only monthly spend rollup.                                                 |
| `ai-budget-watchdog`       | Cron — enforces monthly budget, fires 75/90/100% alerts, auto-disables at 100%. |
| `corner-talk`              | Role-based tactical alert generator for Command Center top strip.               |
| `daily-briefing`           | Cron — daily staff digest.                                                      |
| `ops-tower-narrative`      | Human-readable summary of Ops Control Tower state.                              |
| `ops-booking-narrative`    | Per-booking timeline summary (calls `get_booking_operational_timeline`).        |
| `mcp`                      | Model Context Protocol surface for external tools (list-units, list-bookings, whoami, search-guests, get-exceptions). |

### Security & compliance (**C**)
| Function                     | What it does                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `fenrir-dispatch`            | Batched outbound Fenrir Lock event sender.                                    |
| `fenrir-webhook`             | Fenrir → us; freeze/threat-level updates. (One-way doctrine still applies — Fenrir cannot force actions.) |
| `fenrir-test-ping`           | Admin sanity ping.                                                            |
| `vanta-emit`                 | Outbound Vanta signal endpoint (called by DB trigger + edge fns).             |
| `vanta-dispatch`             | Batched delivery to Vanta.                                                    |
| `vanta-lookup`               | Vanta ↔ ground-truth lookup for a signal ID.                                  |
| `vanta-test-event`           | Admin harness.                                                                |
| `fraud-detection`            | Heuristic pass on new bookings; flags for manual review.                      |
| `manage-integration-secret`  | Admin-only CRUD on `integration_secrets`.                                     |

### Account lifecycle & housekeeping (**C**)
| Function                     | What it does                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `create-staff-account`       | Atomic staff creation (auth user + profile + role + property assignment).     |
| `delete-account`             | Admin-only account wipe with audit trail.                                     |
| `export-user-data`           | GDPR/PDPA data export.                                                        |
| `account-census`             | Cron — observational user/role snapshot.                                      |
| `cleanup-retention`          | Cron — 90-day PII purge per policy.                                           |
| `cleanup-storage`            | Cron — orphaned storage files.                                                |
| `send-transactional-email`   | Resend wrapper (multi-language templates).                                    |
| `send-scheduled-emails`      | Cron — pre-arrival / welcome / review drips.                                  |
| `send-push`                  | Web Push (VAPID); guest + staff notifications.                                |
| `create-notification`        | Server-side notification row creation with fan-out.                           |
| `notify-review-response`     | Notifies guest when staff replies to a review.                                |

### Shared helpers — `supabase/functions/_shared/` (all **C**)
| File                    | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `cors.ts`               | CORS preflight + JSON response helpers. Canonical exports: `corsPreflight`, `getCorsHeaders`, `jsonResponse`. |
| `aiGuard.ts`            | AI budget + rate-limit gate; every AI-invoking function must pass through it.      |
| `fenrir.ts`             | Outbound Fenrir helper with PII scrubbing, event allowlist, correlation stamping.  |
| `fenrir-mapper.ts`      | Internal → Fenrir dotted namespace map + severity taxonomy.                        |
| `lineFlex.ts`           | LINE Flex Message builders.                                                        |
| `richMessages.ts`       | Cross-channel rich message renderer.                                               |
| `webhookHealth.ts`      | Upserts `webhook_health` rows so ops health check can see it.                      |

---

## Client — `src/`

### Pages — `src/pages/`
| Page                  | Role      | Notes                                                                                   |
| --------------------- | --------- | --------------------------------------------------------------------------------------- |
| `LandingPage.tsx`     | Public **B** | Brand narrative. Swap per tenant.                                                    |
| `Stay.tsx`            | Public **L** | `/stay` listings + category tabs (On-site / Premium Villa / Luxury Villa / Long Stay). |
| `EmbedWidget.tsx`     | Public **L** | Standalone booking widget for external sites.                                        |
| `Embeds.tsx`          | Admin **L**  | Embed builder UI.                                                                    |
| `GuestPortal.tsx`     | Guest **C**  | Post-login guest home; tracks arrival journey.                                       |
| `GuestPaymentLink.tsx`| Guest **C**  | Consumes `payment_links`.                                                            |
| `GuestAuth.tsx` / `Auth.tsx` | Public/Staff **C** | Split auth entry.                                                              |
| `Index.tsx`           | Staff **C**  | Staff dashboard.                                                                     |
| `CalendarView.tsx`    | Staff **C**  | Gantt calendar.                                                                      |
| `Bookings.tsx`        | Staff **C**  | Booking list + detail.                                                               |
| `FrontDesk.tsx`       | Staff **C**  | Check-in / check-out console.                                                        |
| `Units.tsx`           | Staff **C**  | Inventory management.                                                                |
| `Messages.tsx`        | Staff **C**  | Inbox with AI drafts + admin review.                                                 |
| `Pricing.tsx`         | Staff **C**  | Pricing rules editor.                                                                |
| `Reports.tsx` / `PaymentReport.tsx` | Staff **C** | Financial reporting.                                                        |
| `Settings.tsx`        | Staff **C**  | Property/policy configuration.                                                       |
| `MediaLibrary.tsx`    | Staff **C**  | Reusable image library.                                                              |
| `SecurityCenter.tsx`  | Admin **C**  | Security events + Fenrir status.                                                     |
| `MonitoringCenter.tsx`| Admin **C**  | System monitoring + webhook health.                                                  |
| `OpsControlTower.tsx` | Admin **C**  | Live ops dashboard (exceptions + service health).                                    |
| `DisasterRecovery.tsx`| Admin **C**  | Snapshot / restore.                                                                  |
| `Simulation.tsx`      | Admin **C**  | War-room simulator (in-memory).                                                      |
| `GuidanceLab.tsx`     | Admin **C**  | `platform_guidance` editor.                                                          |
| `OAuthConsent.tsx`    | Public **C**  | Third-party OAuth consent surface.                                                   |
| `Legal.tsx`           | Public **L** | ToS/Privacy (tenant-specific copy).                                                  |
| `ResetPassword.tsx` / `NotFound.tsx` | Public **C** |                                                                       |

### `src/lib/` — shared frontend + business logic
| File                          | Purpose                                                                        | Class |
| ----------------------------- | ------------------------------------------------------------------------------ | ----- |
| `bookingStateMachine.ts`      | 9-state graph + `BLOCKING_STATES`. **BUSINESS-CRITICAL.**                     | C     |
| `permissions.ts`              | `AppRole` type + capability matrix.                                            | C     |
| `depositPolicy.ts`            | Deposit % + security-deposit resolver.                                         | C     |
| `pricingCalculator.ts`        | Deterministic pricing waterfall.                                               | C     |
| `refundCalculator.ts`         | Tiered cancellation refund math.                                               | C     |
| `paymentTypes.ts`             | Payment type enum + labels.                                                    | C     |
| `statusConstants.ts`          | DB check-constraint mirror. Keep in sync or things break.                      | C     |
| `travelState.ts`              | Unified booking travel-state derivations (`operationallyReady`, etc.).         | C     |
| `operationalStatus.ts`        | Ops readiness derivations.                                                     | C     |
| `arrivalModel.ts`             | Normalizes arrival details from any input source.                              | C     |
| `airportFactSheets.ts`        | Static airport fact data.                                                      | L     |
| `guestDisplay.ts` / `guestTypes.ts` | Guest display formatters + types.                                        | C     |
| `requiredDocuments.ts`        | Nationality → required documents map.                                          | L     |
| `timezone.ts`                 | Asia/Bangkok normalization helpers.                                            | C     |
| `currency.ts`                 | Thai Baht formatter.                                                           | L     |
| `sanitize.ts`                 | HTML/text sanitization for guest content.                                      | C     |
| `csvExport.ts`                | CSV builder for reports.                                                       | C     |
| `errorLogging.ts`             | `safeFetch` + loud failure UI logger.                                          | C     |
| `groundSounds.ts`             | Web Audio synthesized feedback.                                                | B     |
| `amenityIcons.tsx`            | Icon map for amenities.                                                        | L     |
| `aiFocusStore.ts` / `aiSourceLinks.ts` | AI context helpers.                                                    | C     |
| `notifyMessaging.ts`          | Client helper for `notify-via-messaging`.                                      | C     |
| `fenrir/`                     | Client-side Fenrir dispatcher + event emitters + role map.                     | C     |
| `vanta/events.ts`             | Client-side Vanta event emitter.                                               | C     |
| `mcp/`                        | Model Context Protocol tools (list-bookings, list-units, whoami, etc.).        | C     |

### `src/hooks/`
Data-access hooks over Supabase. Naming is literal: `useBookings`, `useUnits`,
`usePayments`-style. All are read-through with realtime where relevant.
Notable ones:
- `useAuth.tsx` — session + role + inactivity timeout. **C**
- `useRolePreview.tsx` — admin-only UI simulation of other roles. **C**
- `useProperty.tsx` — active property context (multi-property switcher). **C**
- `useDashboard.ts` — aggregated dashboard tiles. **C**
- `useCalendarPayments.ts` + `useCalendarDragDrop.ts` — calendar view state. **C**
- `useFrontDesk.ts` — check-in/out console state. **C**
- `usePricingRules.ts` — pricing editor. **C**
- `usePolicySettings.ts` — property-scoped policy overrides. **C**
- `useIntegrationSecrets.ts` — admin-only. **C**
- `usePushNotifications.ts` — Web Push subscription. **C**
- `useAIAssistant.ts` / `useAISettings.ts` — Kru Glitch UI hooks. **C**

### `src/integrations/supabase/`
- `client.ts` — **auto-generated. Do not edit.**
- `types.ts` — **auto-generated after each migration. Do not edit.**

---

## Database — core objects

### Tables (grouped)
- **Identity:** `profiles`, `user_roles`, `user_property_assignments`, `user_consents`, `profile_audit_log`.
- **Inventory:** `properties`, `units`, `unit_groups`, `maintenance_blocks`, `local_recommendations`.
- **Booking core:** `bookings`, `booking_state_log`, `booking_training_links`, `pre_arrival_checklist`, `guest_arrival_stage_log`, `guest_escalations`, `early_checkin_requests`.
- **Payments:** `payments`, `payment_events`, `payment_links`, `payment_link_events`, `payment_reconciliation_log`, `security_deposits`, `tax_invoices`.
- **Guest ops:** `guest_documents`, `airport_pickups`, `drivers`, `driver_property_assignments`, `housekeeping_tasks`, `laundry_requests`, `maintenance_requests`, `stay_support_log`.
- **Messaging:** `messages`, `messaging_chat_bindings`, `messaging_inbound_log`, `messaging_link_codes`, `messaging_notification_log`, `messaging_notification_prefs`, `messaging_thread_memory`.
- **AI:** `ai_assistant_audit`, `ai_model_costs`, `ai_usage_events`, `platform_guidance`.
- **Ops / security:** `notifications`, `push_subscriptions`, `staff_audit_events`, `security_events`, `webhook_health`, `flight_tracking`, `airport_traffic`, `intelligence_entries`.
- **Config / policy:** `policy_settings`, `policy_settings_history`, `pricing_rules`, `training_packages`.
- **Media / reviews / consent:** `media_library_assets`, `reviews`, `review_audit_log`.
- **Recovery / audit:** `recovery_snapshots`, `recovery_audit_log`, `email_log`, `mcp_activity`, `telegram_bot_state`, `integration_secrets`.
- **Vanta:** `vanta_event_log`, `vanta_integration_session`, `vanta_lookup_audit`.

### Critical DB functions (SECURITY DEFINER unless noted)
| Function                                     | Purpose                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `has_role(uuid, app_role)`                   | Every RLS policy leans on this. Recursion-safe via SECURITY DEFINER.       |
| `has_property_access(uuid, uuid)`            | Multi-property scoping.                                                    |
| `check_booking_overlap()` (trigger)          | Blocks overlapping bookings on any `BLOCKING_STATES` row. Raises `23P01`.  |
| `validate_booking_occupancy()` (trigger)     | Enforces `capacity + max_extra_beds`.                                      |
| `validate_maintenance_block_dates()` (trigger) | end_date ≥ start_date.                                                   |
| `auto_create_pending_deposit()` (trigger)    | Idempotently creates deposit obligation on booking hold.                   |
| `auto_create_pending_booking_fee()` (trigger)| Same, for booking fee, gated by policy.                                    |
| `auto_create_pending_security_deposit()` (trigger) | Same, for security deposit, gated by policy.                         |
| `auto_create_housekeeping_task()` (trigger)  | On `completed`, schedules turnover respecting cleaning buffer.             |
| `revoke_links_on_booking_state_change()` (trigger) | Kills payment links when booking leaves `pending_deposit`.           |
| `snapshot_payments_before_booking_delete()` (trigger) | Snapshots booking context onto orphaned payments.                 |
| `emit_vanta_signal()` (trigger)              | Outbound Vanta signal for booking/message/request events. Best-effort; failures don't block writes. |
| `assign_unit_for_group(uuid, date, date)`    | Atomically picks + locks a free sibling unit. Uses `FOR UPDATE SKIP LOCKED`. |
| `log_staff_audit_event(...)`                 | Canonical audit log writer.                                                |
| `log_profile_changes()` (trigger)            | PII change log.                                                            |
| `log_policy_settings_change()` (trigger)     | Policy history.                                                            |
| `get_ops_exceptions()`                       | Ops Control Tower — actionable exceptions.                                 |
| `get_ops_service_health()`                   | Ops Control Tower — service liveness.                                      |
| `get_booking_operational_timeline(uuid)`     | Unified booking timeline across state/payments/arrival/pickup/housekeeping/audit. Admin/manager only. |
| `create_recovery_snapshot(...)`              | Admin-only config snapshot.                                                |
| `get_unit_essentials(uuid)` / `get_unit_private_fields(uuid)` | Role/booking-gated access to wifi + emergency contact.    |
| `get_integration_secret(text)`               | Service-role read of secrets.                                              |
| `is_secret_configured(text)`                 | Boolean check without exposing value.                                      |
| `handle_new_user()` (trigger on `auth.users`)| Auto-creates profile + `guest` role on signup.                             |
| `auto_record_signup_consent()` (trigger)     | Records privacy/tos consent on signup.                                     |
| `sync_last_sign_in()` (trigger)              | Mirrors `auth.users.last_sign_in_at` onto `profiles`.                      |
| `enforce_guidance_tone()` (trigger)          | Guardrail — high-risk guidance forced to neutral tone.                     |
| `mirror_flight_number_to_pickup()` (trigger) | Keeps `airport_pickups.flight_number` in sync with booking.                |
| `notify_booking_checked_in()` (trigger)      | Seeds `stage_4_checkin_pending` marker for arrival journey dispatcher.     |
| `cleanup_expired_link_codes()`               | Housekeeping for messaging link codes.                                     |
| `trim_thread_memory()` (trigger)             | Keeps `messaging_thread_memory` capped at 10 rows per user/channel.        |

### Storage buckets
| Bucket                | Public | Purpose                                                        |
| --------------------- | ------ | -------------------------------------------------------------- |
| `unit-photos`         | yes    | Listing photos.                                                |
| `guest-documents`     | no     | Passport/ID uploads. RLS-scoped to owner + staff.              |
| `maintenance-photos`  | no     | Staff-only maintenance evidence.                               |
| `intelligence-images` | yes    | Public intel/knowledge images.                                 |
| `app-downloads`       | yes    | APK / installer distribution.                                  |
| `tax-invoices`        | no     | PDF invoices; staff + owning guest.                            |

---

## Where to look when things break

| Symptom                                          | Start file                                        |
| ------------------------------------------------ | ------------------------------------------------- |
| Guest paid but booking still pending             | `supabase/functions/payment-webhook/index.ts`, then run `reconcile-stripe-payments` |
| Double-booked unit                               | `check_booking_overlap` trigger + `BLOCKING_STATES` in `bookingStateMachine.ts` |
| Calendar shows wrong availability                | `get-availability/index.ts` + `get_availability` query filters |
| Guest can't see their booking                    | RLS on `bookings` + `has_role`/`guest_id` policies |
| Staff not receiving push                         | `usePushNotifications.ts` + `send-push`           |
| Chat message came in but did nothing             | `messaging-router` — remember, capture-only by design |
| AI is silent                                     | `ai-budget-watchdog` may have auto-disabled at 100% budget |
| Cron job stopped                                 | `get_ops_service_health()` on Ops Control Tower   |
| Refund math looks off                            | `src/lib/refundCalculator.ts` + policy settings   |
