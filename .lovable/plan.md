# GroundStay Operational Activation Blueprint

## Execution Phases

### Phase 1: Revenue Activation (COMPLETE)
1. [x] Save plan
2. [x] Add columns to `payments` table + create `payment_events` table with RLS
3. [x] Add payment provider `policy_settings` rows
4. [x] Add API key policy_settings rows (stripe keys, resend keys)
5. [x] Build `process-payment` edge function (Stripe checkout sessions)
6. [x] Build `payment-webhook` edge function (signature verification, auto-transition)
7. [x] Add payment UI to Guest Portal (GuestPaymentButton component)
8. [x] Wire auto-transition (pending_deposit → confirmed) in webhook
9. [x] Build admin Integration Settings UI (Settings > Integrations tab)
10. [ ] Enable Stripe via admin Settings (user action — enter keys)

### Phase 2: Communication Automation (COMPLETE)
1. [x] Create `email_log` table with RLS
2. [x] Build `send-transactional-email` edge function (Resend, multi-language)
3. [x] Refactor `send-booking-confirmation` to call `send-transactional-email`
4. [x] Extend `expire-stale-bookings` with deposit reminders
5. [x] Build `send-scheduled-emails` cron function (pre-arrival + review request)

### Phase 3: AI Operational Intelligence (COMPLETE)
1. [x] Guest context: own bookings, checklist status, document status, pricing quotes
2. [x] Front Desk context: today's arrivals/departures, 14-day availability
3. [x] Front Desk Supervisor: escalation digest (stale requests, pending approvals)
4. [x] Manager: revenue analytics (30-day payments, occupancy, completed stays)
5. [x] Admin: system health (state log, payment events, policy changes, failed webhooks)
6. [x] Maintenance: prioritized queue with age + overdue detection
7. [x] Section 4A tone enforcement applied across all layers

### Phase 4: Security Hardening (COMPLETE)
1. [x] Harden `delete-account` — verify caller is admin for deleting other users
2. [x] Harden `create-notification` — verify caller has staff role
3. [x] `create-staff-account` already verified admin (confirmed)
4. [x] `get-availability` intentionally public (confirmed)
5. [x] Run database linter — only warning is leaked password protection (non-critical)
6. [ ] Rate limiting on public endpoints (enhancement — requires external middleware)
7. [ ] Enable leaked password protection (user action in auth settings)

### Phase 5: OTA Sync (Optional)
1. [ ] iCal export endpoint per unit
