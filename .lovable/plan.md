# CampStay Language Audit — Full i18n Sweep

## Current state (verified)

- The i18n foundation is real and working: 1,236 English keys across 57 namespaces, plus a full Thai file (the largest locale file in the project) and 7 other languages lazy-loaded.
- Language choice already persists in local storage and there is a `preferred_language` field on the user profile.
- 73 files use translations. Roughly 217 components/pages still contain hard-coded English, including 18 whole pages — Front Desk, Guest Payment Link, Stay, Monitoring Center, Ops Control Tower, Adjustments Center, Media Library, Security Center, Payment Report, Reset Password, Landing Page and others.
- There is currently **no missing-key handler**, so any missing Thai string falls back silently to English (good) but nothing is logged.

So this is not a foundation build — it is a sweep, and it is large enough to need passes.

## Sequencing (agreed)

**Pass 1 — Guest-facing (this plan's build scope)**
Guest Portal and everything a paying guest sees:

- Guest Portal shell, stay summary, playbook, heads-up strip, activity timeline
- Guest booking request flow and the public `/stay` catalog
- Payment screens: guest payment link page, deposit section, payment summary, payment buttons, balance/pay-on-arrival labels
- Documents / ID upload, wrong-document guidance, TM30-facing guest copy
- Airport pickup request and edit flow, arrival date/time and Thailand-time labels
- Arrival welcome guide, route FAQ, recovery notice, in-app-browser banner, email fallback notice
- Guest-side toasts, empty states, loading states, error states, validation messages

**Pass 2 — Staff operations** (Front Desk, Booking Detail, dashboard, turnover/housekeeping, maintenance, warnings and blockers, override/audit panels).

**Pass 3 — Admin tooling** (Settings, Notification settings, Monitoring Center, Ops Control Tower, Security Center, Media Library, Disaster Recovery).

Each pass ends with typecheck plus the full test suite green before the next starts.

## Shared groundwork (built in Pass 1, used by all passes)

1. **Missing-key safety net.** Add a `missingKeyHandler` to the i18n init: return the English value, never the raw key, and log the missing key once per key in dev / to a lightweight in-memory registry admins can read. Guests and staff never see `payments.payOnArrival`.
2. **Central display-label helpers.** One place that maps stable backend values to translated labels — booking status, payment status, deposit state, pay-on-arrival, manual/legacy markers, handled-by-staff, checkout blockers, cleaning status, unit status, pickup status, driver assignment, document status, TM30 status. Database values (`confirmed`, `pending_deposit`, `pay_on_arrival`, `tm30_confirmed`, …) are never touched — only their labels.
3. **Language persistence hardening.** Keep the existing local-storage layer, and sync it with `preferred_language` on the profile at sign-in so staff don't re-pick language per device/session.
4. **Kru Glitch language context.** The assistant edge function already accepts a `language` parameter and injects a `LANGUAGE: Respond in …` directive. Wire the selected UI language through from the assistant panel so Thai dashboards get Thai answers, with an explicit instruction that status codes and figures stay as-is and are only explained in the display language.

## Thai copy standard

Operational working Thai, not textbook Thai. Short labels, imperative verbs, camp/hotel front-desk register. Where a term is universally used in English by Thai staff (Stripe, TM30, check-in), keep the English term inside the Thai string.

## Testing

Add tests for: guest portal renders Thai without raw keys; status/payment/pay-on-arrival/manual-booking/checkout-blocker/cleaning/pickup/document label translation; missing Thai key falls back to English; no raw-key regex appears in rendered guest output; Kru Glitch call carries the selected language. Then run the existing suite (175 tests) plus typecheck.

## Explicitly out of scope

No visual redesign, no behavior changes. Booking flow, payment and Stripe logging, pickup logic, document upload, TM30 tracking, override/audit logging, permissions, RLS, emails and notifications all stay exactly as they are. Backend enums and codes are untouched. Locale files for the other 7 languages are left to fall back to English for the new keys.
