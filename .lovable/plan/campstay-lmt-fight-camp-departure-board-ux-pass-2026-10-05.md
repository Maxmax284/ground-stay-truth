# CampStay LMT — Fight Camp Departure Board UX Pass

## Outcome
Make the existing platform feel like one coherent Lamai operating system: a sharper fight-camp departure board for staff and a calmer arrival board/welcome binder for guests. Mobile containment comes first. This pass reuses current routes, controls, signals, permissions, and actions; it does not create a new dashboard or operational system.

## Verified foundation
- The real guest portal and admin “view as guest” mode share `GuestPortal`, so most hardening benefits both. Preview remains read-only and audit-logged.
- The portal already has width guards, a horizontally scrolling tab row, safe-area bottom padding, compact preview controls, Camp Pass cards, and reduced-motion variants. The remaining work is a systematic regression pass plus the known floating-control, long-content, dialog, and nested-card risks.
- Front Desk already contains Desk, Check-in, Arrivals, Chase List, travel checks, and role-gated overrides under one hub.
- Corner Talk already has role filtering, deterministic daily brief data, severity, reasons, dismissal state, and links into Kru Glitch. Chase List already combines readiness, reply-needed, bounced-email, payment, ID, flight, and portal-open signals.
- Alert audience and level labels already exist: Ops / Owner / Engine and Urgent / Important / Digest / Silent. Guest Stay Alerts remain separate from staff alerts.
- Camp Pass, split-flap, soft guest motion, and reduced-motion primitives already exist, but their application is inconsistent.

# 1. Existing components and surfaces to touch

## Shared visual foundation
- Global semantic design tokens and existing Camp Pass/departure-board utilities.
- Shared staff and guest page shells, headers, safe-area spacing, page-entry treatment, cards, badges, tabs, sheets, dialogs, buttons, and loading/error states.
- Shared booking-state variants and existing operational-status presentation classes; presentation only, never classification logic.

## Guest surfaces
- Real Guest Portal and its admin preview state.
- Guest shell/header, guest navigation tabs, “Your next step” card, journey banner, welcome flow, booking cards, arrival/pickup cards, Talk to the Camp, Stay Alerts, Camp Notices/messages, ID upload, payment summary, stay support, and guide/binder content.
- Guest message thread dialog and inbox rows.
- Kru Glitch bubble/panel and Front Desk floating contact control as one coordinated mobile dock zone.
- Existing synthetic guest preview should either reuse the real portal presentation primitives or be clearly treated as a visual sandbox so it cannot silently drift from the real preview.

## Staff surfaces
- Staff dashboard, Corner Talk, dashboard stat cards/charts, Front Desk hub, Check-in Desk, Arrivals Board, Chase List, Booking Status dossier, Bookings cards/table, Messages, Notification Center, and Ops Control Tower/Friction Radar.
- Shared booking detail and operational timeline sheets, preserving all existing deep links and `data-ai-focus` / spotlight attributes.

# 2. What must not be touched

- No booking state-machine, confirmation, cancellation, room assignment, pricing, discount, payment, refund, balance, ID approval, pickup, driver, check-in, or check-out logic.
- No auth, role hierarchy, property isolation, RLS, schema, migrations, database writes, scheduled jobs, email routing, push delivery, WhatsApp routing, alert fan-out, or notification delivery changes in this design pass.
- No automatic action from messages, taps, flight data, alerts, AI, or notifications.
- No new dashboards, duplicate inboxes, duplicate guest portals, new notification stack, or replacement intelligence system.
- No removal of human confirmation dialogs, audit logging, preview read-only controls, existing action permissions, or safety language.
- No change to the immutable booking-adjustment history rule.
- Do not turn `ai_action_drafts` into an active workflow during this pass. It remains an existing future approval seam only.

# 3. Staff-side UX plan

## One operating-board hierarchy
Use the existing staff shell and routes, but standardize each page into three visual levels:
1. **Station header:** page name, current property/context, freshness/refresh state, and only essential controls.
2. **Street read:** Corner Talk or the existing deterministic briefing, shown once rather than duplicated.
3. **Work board:** existing queues/cards arranged by urgency, then time.

## Dashboard and Corner Talk
- Make Corner Talk the visual lead: compact departure-board header, “Today’s Street Read,” then ranked items.
- Keep current role filtering and data. Present every item as **label → reason → destination**, for example: `REPLY NEEDED · latest guest message has no staff response → Messages`.
- Keep collapse, read/dismiss, and “ask Kru Glitch” behavior intact.
- Use the established role lenses in the presentation:
  - Nam/front desk: arrivals, flight/ID/payment gaps, messages, pickup trouble, bounced guest email.
  - Nikki/Ralph/admin: booking requests, owner exceptions, weekly friction, guest communication health.
  - Maxwell/admin: delivery health, push/email/webhook status, booking-visibility spikes, payment funnel friction, pending drafts.
- Restyle existing dashboard totals and charts as quieter board modules. Animate only numbers that changed, not whole panels on every render.

## Front Desk, Chase List, and Booking Status
- Preserve the existing Front Desk switcher and tabs; make the hierarchy read as one room: Desk / Check-in / Arrivals.
- Standardize attention stamps using existing facts: `NEEDS EYES`, `READY`, `MISSING ID`, `ARRIVING`, `IN TRANSIT`, `PAYMENT OPEN`, `REPLY NEEDED`.
- Each Chase List and Front Desk card should visibly answer:
  - **Why here:** the highest-priority verified signal.
  - **What is known:** room, dates, journey/readiness state, latest contact.
  - **Next safe action:** an existing permitted route/button only.
- Keep urgency ordering deterministic. Never infer urgency from sentiment, nationality, origin, or guest scoring.
- Apply the same label/reason/action grammar to Booking Status so it acts as the dossier behind each compact card.
- Keep operational actions visually separate from advisory information. Check-in, payment recording, ID review, and pickup assignment retain their current permission checks and confirmation patterns.

## Ops Control Tower and notifications
- Treat Ops Control Tower as the engine room, not another front desk. Systems Health, Exceptions, Timeline, Verification, and Friction Radar remain separate tabs within the existing page.
- Bring Notification Center and settings into the same audience/level visual language already defined by the alert catalog.
- Centralize presentation metadata for alert labels/icons/colors during implementation, while leaving delivery and preference behavior unchanged.

# 4. Guest-side UX plan

## Calm arrival board
- Lead with one unmistakable **Your next step** block using current journey state and existing actions.
- Under it, present a compact **Stay Board** with the five existing areas: Booking, Arrival, Deposit, ID, Messages. It is navigation/status presentation, not a new workflow.
- Before arrival, prioritize countdown, current travel leg, official airport guidance, pickup state, and the existing guest confirmation actions.
- After check-in, shift emphasis to the existing welcome binder: Wi‑Fi, house rules, support, laundry/maintenance, emergency information, and guide content.

## Official communication
- Style Camp Notices as official camp-issued rows inside the existing booking thread, with clear sender, time, delivery context where available, and the existing reply control immediately below.
- Keep “Talk to the camp” as the primary human contact path. Portal chat remains first; WhatsApp appears only when configured.
- Keep Stay Alerts benefit-led and calm. Email remains visibly reliable fallback; push enrollment must never imply a guarantee.

## Safety and clarity
- Payment, passport/ID upload, emergency information, arrival taps, and check-in-related actions stay high contrast, immediate, and low-motion.
- Flight information displays its source and confidence language without claiming the guest’s physical location.
- Preserve all nine languages and test long translated strings rather than designing only for English.

# 5. Mobile hardening plan

This is the first implementation phase and a release gate for everything after it.

## Containment rules
- Establish one mobile containment contract across guest and preview shells: every child uses `min-width: 0`, media never exceeds its container, long identifiers/emails/messages wrap, and only designated tab/table regions may scroll horizontally.
- Audit every guest portal section, dialog, sheet, carousel, table, form row, button group, badge cluster, and admin-preview control at 360, 375, 390, and 414px.
- Stack competing actions below the small-screen breakpoint; retain at least 44px touch targets for important guest actions.
- Convert dense date/price/status headers to a vertical mobile hierarchy rather than shrinking type until unreadable.

## Specific fixes to validate or complete
- Guest message cards: enforce bounded bubbles, break long unspaced text/URLs, keep timestamps/source labels inside, and stack composer controls when needed.
- Stay Alerts: constrain carousel/detail content, prevent swipe gestures from moving the page sideways, and make dismiss/action targets reachable.
- Admin preview: retain guest identity, `read-only`, `audit-logged`, selector, and exit action in a compact two-row treatment.
- Tabs: one internal horizontal rail with visible scroll affordance and automatic active-tab visibility; never wrap into overlapping rows or widen the body.
- Floating controls: coordinate Kru Glitch and Front Desk as one dock. On phones use compact icon controls above the safe area; suppress or relocate reply previews when they would cover a composer, payment, upload, arrival, or navigation control. Open Kru Glitch as the existing bottom sheet using dynamic viewport height.
- Header: retain sign-out, language, alerts, theme, install state, and preview state without allowing the title or controls to force overflow.
- Keyboard test: confirm message and AI composers remain visible above iOS/Android virtual keyboards.
- PWA test: confirm top/bottom safe areas in standalone mode and browser mode, including rotation and restored floating-control positions.

# 6. Motion and aesthetic system plan

## Fight Camp Departure Board tokens
Extend the existing semantic system rather than add page-specific colors:
- **Deep ring canvas:** primary dark operational surface.
- **Aged gold:** verified/ready/official emphasis, used sparingly.
- **Warm terracotta:** human attention and Lamai warmth, not generic error red.
- **Red and blue corners:** restrained opposing accents for status grouping, never decorative overload.
- **Canvas/gym texture:** very low-contrast surface texture on large bands only; never behind dense body copy or controls.
- **Stamped labels:** short uppercase operational chips with consistent hierarchy and no novelty boxing graphics.

## Motion grammar
- **Staff:** one 250–300ms split-flap reveal when a verified count or status changes; short stagger only for a newly loaded group; no ambient looping except a genuinely urgent indicator.
- **Guest:** one softer settle on first load or journey-state change; no repeated flips while reading.
- **Instant/no-motion zones:** emergency details, payment controls, ID upload, check-in/out confirmations, destructive actions, message send, and validation errors.
- Respect reduced motion globally, including current LED/pulse, Stay Alerts transitions, Kru Glitch, page entry, flight radar, and any newly styled status change.
- Sound remains opt-in and existing only; this pass adds no new audio behavior.

## Anti-cheese guardrail
No boxing clipart, blood, skulls, ropes around every card, fake distressing over text, macho copy, constant ticking, gratuitous glow, or animation without an operational meaning.

# 7. Notification and intelligence readiness plan

This pass prepares the presentation seams only; data/behavior work requires a separate approval later.

## Existing alert spine
- Use one visual taxonomy across the current bell, Notification Center, Settings, Corner Talk, and Ops Tower:
  - **Stay** — guest journey and staff replies.
  - **Ops** — front desk action.
  - **Owner** — judgment/exception decisions.
  - **Engine** — system and delivery health.
  - Level: **Urgent / Important / Digest / Silent**.
- Every rendered alert should show truthful state language: what happened, why it matters, and where to inspect it. Never phrase a signal as a completed business action.

## Readiness for later intelligence
Reserve consistent, reusable presentation slots inside existing surfaces:
- Corner Talk: today’s role-scoped, reason-citing read.
- Front Desk/Chase List: Arrival Risk and next-safe-action labels.
- Dashboard/Ops Tower: Payment Friction and Email/Notification Health summaries.
- Friction Radar: weekly trends and Guide Gap Suggestions.
- Existing approval area: AI drafts, if ever reactivated, remain reviewable drafts only.

No new cards appear until an existing deterministic signal can populate them. Empty future categories stay absent, not shown as dead placeholders.

## Future arrival fallback contract
When separately approved, the existing Arrivals Board should display evidence lanes rather than one absolute truth:
- Official flight API status.
- Cached status with age.
- Guest-entered itinerary.
- Scheduled time.
- Staff notes.
- Explicit guest “landed/ready” confirmation.

Each lane shows source, timestamp, and confidence. Conflicts say `Needs human resolve`. Aircraft landed never means guest arrived, ready, collected, or checked in.

# 8. QA checklist

## Mobile and visual
- Test authenticated guest and admin preview at 360, 375, 390, and 414px, plus representative Android Chrome and iPhone Safari dimensions.
- Test iPhone Home Screen standalone mode, browser chrome expansion/collapse, portrait/landscape, virtual keyboard, safe areas, and text zoom.
- Assert document width equals viewport width; inspect for clipped descendants, fixed-position collisions, and accidental nested horizontal scrolling.
- Test long guest names, long emails, long unbroken messages/URLs, large translated labels, multiple badges, and large currency values.
- Verify tabs, preview selector, sign-out, message composer, Stay Alerts, Talk to the Camp, ID upload, payment actions, and arrival buttons remain visible and tappable.

## Role and workflow regression
- Compare real guest view with admin preview for the same booking; preview must remain read-only and audit-logged.
- Validate admin, manager, front desk, supervisor, maintenance, viewer, and guest presentation against existing permissions.
- Click existing routes from Corner Talk, Chase List, Booking Status, notifications, and Arrivals Board; preserve query parameters and deep links.
- Confirm messages, Camp Notices, arrival taps, flight displays, and notifications still create/display signals only.
- Confirm no booking, room, price, payment, refund, ID, pickup, or check-in state changes occur from any new presentation element.

## Accessibility and resilience
- Keyboard order, focus visibility, dialog focus trap, labels, contrast, 44px critical touch targets, screen-reader names, and zoom to 200%.
- Reduced-motion OS setting removes flips, pulses, shimmers, and nonessential transitions without hiding state.
- Loading, empty, stale, partial-failure, offline/PWA, bounced-email, push-unavailable, and expired-session states stay explicit and recoverable.
- Run the relevant UI tests/build checks and an authenticated end-to-end walkthrough before each phase is considered complete.

# 9. Suggested implementation order

1. **Mobile containment gate** — guest portal, admin preview, message cards/dialogs, Stay Alerts, tabs, header, floating dock, keyboards, safe areas, and PWA widths. No aesthetic expansion until this passes.
2. **Shared visual primitives** — refine semantic tokens, texture, stamps, station headers, Camp Pass variants, density rules, and reduced-motion coverage.
3. **Guest calm-board pass** — next step, Stay Board presentation, arrival/welcome sequence, Camp Notices, Talk to the Camp, support, and binder surfaces.
4. **Staff operating-board pass** — dashboard, Corner Talk, Front Desk, Check-in, Arrivals, Chase List, Bookings, and Booking Status using one reason/action grammar.
5. **Engine-room consistency** — Ops Control Tower, Friction Radar, Notification Center, settings, charts, tables, and shared sheets; visual taxonomy only.
6. **Cross-role and real-device QA** — run all widths, languages, roles, preview parity, reduced motion, PWA, and critical workflows; fix regressions before release.
7. **Separate future approval: intelligence wiring** — only after the design system is stable, consider read-only rollup changes for Arrival Risk, Payment Friction, delivery health, guide gaps, or improved role-specific Corner Talk. No action authority is added.

## Definition of done
- No guest or preview horizontal body overflow at required widths.
- No floating control covers a critical action, composer, or navigation element.
- Staff cards consistently state why they are present and the next permitted human action.
- Guest screens consistently show the next step without exposing internal operational noise.
- Existing functions, permissions, routes, data, and safety doctrine remain unchanged.
- The whole product reads as Lamai’s fight-camp departure board—not generic SaaS, and not a costume.
