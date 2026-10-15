# Change Control Plan: Booking Attribution & Growth (CampStay LMT + Lamai Global V2)

PLAN ONLY. Approving this document approves nothing for build or release. Each phase below has its own approval gates, and agreeing to the plan does not count as approval for any of them.

## Governance (applies to every phase)

1. Before any change: take a baseline snapshot (git commit id, schema dump of the tables involved, row counts, test results) and list the exact files and schema to be touched.
2. Write a narrowly scoped proposal with alternatives, dependencies and risk.
3. **FOUNDER APPROVAL (BUILD)** is a separate, explicit message per phase.
4. Test on preview/staging, including the regression suite below.
5. **FOUNDER APPROVAL (RELEASE)** is a separate, explicit message before publishing.
6. Keep rollback steps ready and run the post-release check within 24h.

Hard limits:
- No changes to Lamai Global CMS roles, pages, media, schedules, blocks or publishing.
- No framework migration.
- No cross-project write access is assumed. The projects talk only through versioned, documented contracts.
- No pixels or tags in the staff app, guest portal, `/pay/:token` or the auth pages.
- No changes to pricing, discount, deposit, refund or state-machine code.

## Baseline already verified (read-only, Oct 15 2026)

- The `bookings` table has no source/UTM/referrer column.
- `/stay` → `/auth/guest?unit=` (Stay.tsx:169) drops the query string. The CTAs at Stay.tsx:454 and :470 pass no query. `GuestAuth.tsx` forwards only `unit` to `/guest`.
- CampStay has no gtag, fbq, GTM or other third-party analytics.
- Lamai Global V2 has first-party, PII-free `publicEvents.ts` → `public-event-ingest`. Its snapshot contains no link to CampStay.
- Guest-created bookings are inserted client-side in `src/hooks/useBookings.ts:84`. Staff quick-creates go through `supabase/functions/admin-booking-flow`.

## Shared regression suite (run in every phase, pass = all green and no diffs)

- Existing tests: `occupancyPricing`, `pricingClarity`, `modifyStayPreserve`, `upgradeCarryForward`, `offlinePayments`, `paymentSystem`, `paymentLaunchSafety`, plus the full `bunx vitest run`.
- Manual preview checks:
  - A guest signs up from `/stay` with a unit chosen, the inquiry is created, and the total matches the pre-change quote for the same dates.
  - Admin applies a discount, and `booking_adjustments` records an active row.
  - Inquiry → pending_deposit creates the deposit obligation.
  - Recording an offline payment updates the guest portal live.
  - The refund preview is unchanged.
  - Pickup fee is still billed as an add-on.
  - Front-desk, manager and admin roles see the same menus as before. A guest cannot read other bookings (RLS probe as guest).
- Integrations: payment webhook health stays "healthy", and the email and alert functions return 200 on their dry-run checks.
- Lamai Global (Phase C only): a staff editor can edit, save and publish a page, a media item, a schedule and a content block.

---

## Phase A — Verify (no code)

Scope: read-only checks only.
- Read project analytics for CampStay.
- Read the Google/Meta Ads setup status (status only, no setup action).
- Map Lamai Global's CTA destinations from its CMS content: ask the V2 project to export them, since I can't read its database from here.
- List every CampStay public entry: `/`, `/stay`, `/island-guide`, the embed widget, `/pay/:token`.
- Reproduce the parameter loss on preview: open `/stay?utm_source=test`, click Request, and confirm the URL at `/auth/guest` has no `utm`.

Files touched: none. Deliverable: an addendum to this report.

Acceptance criteria:
- PASS when every entry point and its handoff is documented with evidence, and the ads/analytics status is recorded.
- FAIL if any check needs a write.

Stop trigger: any tool asks to connect, create or spend.

Approvals: Founder accepts the Phase A findings. **Owner (Lamai Global)** confirms the real CTA URLs.

---

## Phase B — UTM preservation + isolated attribution storage (CampStay only)

Proposed files:
- New `src/lib/attribution.ts`: captures an allow-list of parameters (`utm_source/medium/campaign/content/term`, `gclid`, `fbclid`, `lg_sid`), each capped at 100 characters. Values that look like an email or phone number are dropped. Stored first-touch in sessionStorage with a 30-day expiry.
- `src/pages/Stay.tsx` and `src/pages/EmbedWidget.tsx`: call the capture once on page load. Navigation is not changed.
- `src/pages/GuestAuth.tsx`: no change needed, because sessionStorage survives the signup redirect. An alternative is to append the parameters to the URL, which I'd reject because it leaks them into the confirmation email link.
- `src/hooks/useBookings.ts`: after a successful insert, make a fire-and-forget call to a new function. The booking insert itself is unchanged.
- New edge function `record-booking-attribution`: checks the caller's JWT and that the caller owns the booking, which must be in `inquiry` and created less than 10 minutes ago. It runs the sanitizer again on the server, inserts once and never updates.
- Migration (additive): new table `booking_attribution`:
  - Columns: `booking_id` uuid unique, `utm_*`, `click_id_type`, `click_id_hash` (SHA-256, never the raw id), `lg_sid`, `landing_path`, `first_seen_at`, `created_at`.
  - It is a separate table, not new columns on `bookings`. The alternative of columns on `bookings` is rejected because it touches the hot table and its triggers.
  - RLS: SELECT only for `has_ops_read`. No access for guests or anonymous users. INSERT only through the service role.
  - A trigger blocks UPDATE and DELETE (append-only, the same pattern as the other audit tables).
  - GRANTs follow the public-schema rules.
- UI: a read-only "Source: direct / lamai-global / google…" line on `BookingDetailSheet`.

Fallback when no attribution exists: no row is written, the UI shows "Source: direct/unknown", and the booking flow is completely unaffected. A failure in the function is logged and never shown to the guest.

Dependencies: Phase A approved. The parameter allow-list is approved by the Founder.

New tests:
- Sanitizer unit tests (allow-list, length caps, email/phone stripping).
- Function tests: refuses someone else's booking, refuses a second insert, refuses anonymous callers.
- RLS probes: guest SELECT gets 0 rows, front-desk SELECT works, UPDATE is blocked.
- Booking still gets created when the function returns 500.

Acceptance criteria:
- PASS when `/stay?utm_source=lamai-global` → signup → inquiry produces exactly 1 attribution row, the regression suite is green, and pricing totals match the baseline exactly.
- FAIL on any booking-insert error, any price diff, any guest-visible change, or any PII in the table.

Stop/rollback triggers: inquiry creation errors rise above baseline, any RLS probe fails, or the function error rate is over 5% in 24h.

Rollback:
1. Revert the client commit, so capture stops.
2. Undeploy `record-booking-attribution`.
3. Drop the table only with separate founder approval (it is additive, so leaving it in place is harmless).

Approvals:
- **FOUNDER APPROVAL (BUILD)**
- **FOUNDER APPROVAL (RELEASE)**
- **Compliance:** add one line on attribution to the Privacy Policy (`/legal`). PDPA/GDPR review is needed because click ids are processed, even hashed.

---

## Phase C1 — Server-side outcome events + signed webhook (contract v1)

Proposed:
- Migration (additive): new table `booking_outcome_events`:
  - Columns: `id`, `booking_id`, `event` (`inquiry_qualified`, `deposit_paid`, `booking_confirmed`, `stay_completed`, `cancelled`), `value_band`, `occurred_at`, `delivery_status`, `attempts`.
  - Unique on (booking_id, event) so each event fires once.
  - Fed by an AFTER INSERT trigger on `booking_state_log`, and only for bookings that have an attribution row. The trigger only inserts into the new table. It never touches bookings or payments.
  - Same RLS and append-only rules as Phase B, except the delivery fields can be updated by the service role.
- New edge function `dispatch-outcome-webhook`:
  - Runs on cron every 10 min, in batches of 50 or fewer, with backoff and a cap of 5 attempts.
  - Signs each send with HMAC-SHA256, using a secret stored in `integration_secrets` through `manage-integration-secret`.
  - Headers: `X-Lamai-Signature`, `X-Lamai-Timestamp`, `X-Contract-Version: 1`.
- Contract v1 payload, documented in `docs/platform-event-schemas.md`:
  `{ v:1, event_id, event, lg_sid, utm_source, utm_campaign, value_band:"<10k|10-30k|30k+", occurred_at }`
  - It contains no booking id, name, email, phone, amount or unit.
  - The receiver rejects requests where the timestamp skew is over 5 minutes, and de-duplicates on `event_id`.
- Lamai Global side, in the **V2 project's own chat, needing the V2 owner's approval**: a new receiver function plus an `AnalyticsHub` card. It is additive and does not touch CMS tables, roles or publishing.
- Reporting: a CampStay Reports funnel card showing inquiries → qualified → confirmed → completed by source, aggregated only.

Dependencies:
- Phase B live and stable for 14 days.
- Value bands approved by the Founder/Nikki.
- Contract v1 signed off by both owners.
- Shared secret exchanged out-of-band.

Tests:
- Firing the same transition twice gives 1 event.
- A wrong signature gets a 401.
- A replay beyond 5 minutes is rejected.
- A payload schema snapshot test.
- The regression suite stays green.
- Lamai Global CMS edit/publish smoke test passes.
- A booking without attribution produces no event.

Acceptance criteria:
- PASS when 100% of test transitions are delivered exactly once, there are 0 PII fields, and both projects' regression suites are green.
- FAIL on a duplicate delivery, any state-machine or payment behaviour change, or any CMS regression.

Stop/rollback triggers: the webhook failure rate goes over 20%, the receiver gets an unexpected 5xx, or a CMS editor reports any issue.

Rollback:
1. Disable the cron.
2. Rotate the secret.
3. Drop the trigger (the events table stays as an audit record).
4. Lamai Global disables its receiver on its own side.

Approvals:
- **FOUNDER (BUILD)**
- **LAMAI GLOBAL OWNER (receiver BUILD)**
- **FOUNDER (RELEASE)**
- **LAMAI GLOBAL OWNER (RELEASE)**

## Phase C2 — Optional ads + consent (separate decision, may never happen)

- Consent banner on CampStay public pages only (`/`, `/stay`, `/island-guide`). Choices are logged in the existing `user_consents` table or in local-only storage for anonymous visitors.
- Server-side offline conversion upload to Google/Meta, keyed only on consented click ids, sending value bands. No browser pixels. If a pixel is ever chosen, it goes on `/stay` only, behind consent.
- Ads accounts are connected through Lovable's ads setup only after **FOUNDER approval, including budget**. No campaigns or spend without a further approval.

Tests and acceptance criteria:
- PASS when no network calls go to ad domains before consent or on any authenticated route (checked with a Playwright network audit), and conversions match the counts in `booking_outcome_events`.
- Stop trigger: any ad request from a staff, guest or payment route.

Rollback: switch off the uploader, remove the banner, revoke the ad account link.

Approvals: **FOUNDER (BUILD, BUDGET, RELEASE)**. **Compliance:** PDPA/GDPR consent wording and privacy policy update are required before release.

---

## Open items
- `roadmap.md` could not be updated in plan mode. Add "Attribution change control A/B/C1/C2" to it on first build approval.
- Refund and waiver code was not re-read in this audit. Phase B's baseline must re-snapshot the refund tests before build.
