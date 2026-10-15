# Cross-Platform Booking & Growth Audit (read-only report)

Scope: CampStay LMT (this project) and Lamai Global Platform V2 (read-only snapshot, commit 5bef7c6f). Nothing was edited, tracked, or published. Approving this plan approves only the report. Each build phase below needs its own sign-off.

## 1. Verified findings (confirmed by reads this session)

- **No attribution capture in CampStay.** The `bookings` table has 37 columns and none of them record source, UTM, referrer or campaign. The only `booking_source` match is a label row in an early migration seed, not a column.
- **No ad pixels or third-party analytics in CampStay.** No gtag, fbq, GTM, PostHog or Plausible anywhere in `src/` or `index.html`. That is the right baseline for a staff app.
- **Campaign tags get dropped at the public entry.** On `/stay`, "Request" sends visitors to `/auth/guest?unit=<id>` (Stay.tsx:169), which throws away `utm_*`. The generic CTAs (lines 454 and 470) go to `/auth/guest` with no query at all. Only the staff login link keeps `window.location.search`. So even a tagged link from Lamai Global loses its source at signup.
- **CampStay's public surfaces:** `/`, `/stay`, `/island-guide`, `/pay/:token`, the embed widget (`EmbedWidget.tsx`) and `/embeds` (staff-gated builder). `/stay` reads availability through `get-availability` and `policy_settings` (camp_info) with the publishable key.
- **Lamai Global V2 already has first-party analytics.** `src/lib/analytics/publicEvents.ts` batches `public.pageview`, `public.cta.click`, `public.accommodation.viewed` and `public.product.viewed` to its own `public-event-ingest` function. It uses a random session UUID from sessionStorage, plus referrer and path, with no PII or IP on the client. It has an `AnalyticsHub` on the staff side.
- **There is no code link between the two projects.** A search of the V2 snapshot for `campstay`, `lmtcampstay` or `ground-stay` found nothing. No shared webhook, API or redirect contract exists, and the two projects use separate backends.
- **The lifecycle is enforced and auditable.** States are defined in `bookingStateMachine.ts` (inquiry → pending_deposit → confirmed → checked_in → completed). soft_hold and pending_approval exist but are legacy or override-only. `booking_state_log`, `override_audit_log` and the immutable `booking_adjustments` hold the audit trail. Pickup fees are billed as add-on obligations, outside pricing.

## 2. Inferred / unverified (needs checking before any build)

- Whether Lamai Global's CTAs actually link to lmtcampstay.com/stay, or only go to WhatsApp or a contact form. I found no hardcoded link, but it may be stored as CMS content in its database.
- Whether the Oct 14 2026 Lovable growth features (analytics, Google/Meta Ads setup, Search Console) are on for either project. I didn't call them in this audit. First step of P0: read project analytics and ads status.
- Refund, waiver and discount paths were not re-read this session. They come from project memory and earlier audits. Re-verify before any reporting joins financial data.
- RLS on a future attribution table is a design point only. Nothing exists yet.

## 3. Current architecture

```text
 Lamai Global V2 (lamaimuaythai.com)          CampStay LMT (lmtcampstay.com)
 ---------------------------------           ---------------------------------
 public pages --emitPublicEvent--> own       /stay (public) --get-availability-->
 public-event-ingest (own backend)            |  "Request" -> /auth/guest?unit=  (UTM LOST)
 AnalyticsHub (staff)                         v
        |                                    guest signup -> booking (inquiry)
        |  (no link / webhook / API)           -> pending_deposit -> payment (Stripe webhook)
        x--------------------------------->    -> confirmed -> checked_in -> completed
                                             staff app (MFA/device gated, no pixels)
                                             audit: state_log, adjustments, override_audit
```

## 4. Safe attribution model (recommended)

The principle: attribution is a label written once at the moment of inquiry. It never moves money, rooms or state.

- **Capture:** on `/stay`, `/` and the embed, read `utm_source/medium/campaign/content`, `gclid`/`fbclid` and the Lamai Global session id (passed as `lg_sid`). Store them in sessionStorage and carry them through `/auth/guest` to the first booking insert.
- **Store:** a separate `booking_attribution` table (booking_id, source fields, landing path, first_seen_at). It holds no names, emails or phones. Staff with ops read can see it; guests can't. Writes go only through a server-side insert at booking creation, and the row can't be changed after that.
- **Outcome events** come from server-side state transitions only, never from the browser: `inquiry_qualified` (moved to pending_deposit), `deposit_paid`, `booking_confirmed`, `stay_completed`, `cancelled`. They carry booking UUID, date, unit type and a value *band*, never exact amounts or guest data.
- **Back to Lamai Global:** an optional signed (HMAC) webhook sends `{lg_sid, event, band, ts}` so V2's AnalyticsHub can show which pages produce real stays.
- **Ads:** if Google/Meta conversion uploads are wanted later, they'd be server-side offline conversions keyed on gclid/fbclid with no PII. There would be **no pixels in the staff app, guest portal, payment page or `/pay/:token`**. If a pixel is ever approved, it belongs on the public `/stay` page only, behind a consent banner.

## 5. Roadmap

- **P0 (verify, no code):** read analytics and ads status for both projects. Confirm Lamai Global's real CTA destinations. Owner approves the attribution data fields and which conversion events count.
- **P1 (CampStay, low risk):** keep query params through `/stay` → `/auth/guest` → booking creation. Add the `booking_attribution` table with RLS, grants and an append-only guard. Add a read-only "Source" line on the booking sheet. No change to booking, pricing or payment logic.
- **P2:** a server-side outcome emitter attached to `booking_state_log` and payment success. Add a signed webhook to Lamai Global V2 and a matching receiver there. Add a funnel card (inquiries → qualified → confirmed by source) to Reports.
- **P3:** optional Google/Meta offline conversion upload with consent, add a consent banner to the public pages, and an attribution retention purge that fits the existing 90-day policy.

## 6. Risks

- PII leaking through UTM values (for example someone tags `utm_content=john@...`). Mitigation: allow-list and length-cap the values on the server.
- Exact financial values reaching ad platforms. Mitigation: send value bands only.
- Spoofed webhooks. Mitigation: HMAC signing plus a timestamp window, with the secret kept in the integration vault.
- Double-counting when a booking bounces between states. Mitigation: one idempotent event per (booking, event).
- Pixel creep into authenticated pages. Mitigation: a written rule in AGENTS.md plus a review gate.

## 7. Dependencies and owner approvals

- Nikki/admin: approve the conversion definitions and value bands.
- Maxwell: approve the cross-project webhook contract and secret.
- PDPA/GDPR: update consent and privacy wording before any ad-platform upload (P3).
- Lamai Global V2 owner: approve adding `lg_sid` to outbound CTAs and the receiver function.
