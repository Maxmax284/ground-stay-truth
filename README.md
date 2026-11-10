# LMT CampStay
### Hospitality operations, built around the guest's real journey

**LMT CampStay** (formerly GroundStay) is a web-based accommodation and hospitality operations platform developed for **Lamai Muay Thai in Koh Samui, Thailand**. It connects the guest journey with the staff workflows behind it: reservations, deposits, room availability, arrivals, transport coordination, messaging, and day-to-day property operations.

This is more than a booking form. It is an operational system designed around what happens **before, during, and after a guest's stay**.

> **Project context:** An actively developed, real-world application. This public repository documents the engineering work; it is not a hosted demo, a turnkey property-management product, or an assurance that every external integration is configured in a fresh installation.

## The problem

A guest may book a room, pay a deposit, send documents, message staff, change arrival plans, request pickup, and need help during a stay. When those steps live in separate chats, spreadsheets, and payment dashboards, important details slip through the cracks.

CampStay brings those events into a shared workflow so the front desk can answer practical questions: Who is arriving? Has the deposit been recorded? Is the room available? Is airport pickup organized? What still needs attention?

## What the codebase covers

| Area | Capabilities represented in the repository |
| --- | --- |
| Reservations | Booking requests, staff booking flows, calendar views, availability checks, unit assignments, and booking history |
| Payments | Stripe Checkout/payment links, deposit obligations, webhook processing, refunds, payment reporting, and reconciliation tooling |
| Guest experience | Guest portal, stay summary, pre-arrival checklist, documents, guest communication, and local arrival guidance |
| Arrival logistics | Flight status workflows, airport pickup coordination, arrival stages, and driver-facing tools |
| Staff operations | Front-desk boards, arrivals/departures, duties, maintenance, housekeeping, laundry, and operational reporting |
| Communication | Message-routing integrations for LINE, Telegram, WhatsApp, and SMS; translation and notification workflows |
| Governance | Staff roles, property-scoped access, booking transition logs, operational audits, MFA-related controls, and monitoring surfaces |
| AI assistance | Staff-facing summaries and drafts with human review rather than chat-triggered operational execution |

These are **implemented surfaces and code paths**, not a claim that all external providers are enabled in every environment.

## Representative workflows

**Booking to confirmation**

1. A booking request or staff-created reservation enters the booking workflow.
2. Availability and date overlap rules determine whether it can reserve a unit.
3. Deposit or other payment obligations are tracked separately from the payment transaction itself.
4. A validated payment event updates the recorded payment and booking lifecycle.
5. Staff and guests can follow the confirmed booking through arrival and check-in.

**Arrival coordination**

1. Guest details, travel information, and documents are captured in the guest journey.
2. Flight and pickup information is surfaced to staff.
3. Arrival stages and staff updates keep the guest-facing portal aligned with operations.
4. Support requests during the stay have a place in the same system.

**Messaging without uncontrolled side effects**

Inbound messages can contribute context and proposed work. The architecture separates **capture → review → approval → execution** so an external chat message is not itself authorization to change reservations or payments.

## Architecture

~~~text
Guest portal / Staff dashboard / Public booking
                     |
                React + Vite
                     |
         Supabase Auth + PostgreSQL
          /          |          \
   RLS and data   Edge Functions   Storage
   access rules   (Deno)           (documents/media)
                     |
        Stripe / messaging / flight services
                     |
        Monitoring, reconciliation and audit
~~~

**Primary stack:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Supabase/PostgreSQL, Deno Edge Functions, Stripe, Vitest, and PWA-related tooling. Capacitor dependencies support mobile application packaging work.

### Architectural decisions worth examining

- **Booking state machine:** src/lib/bookingStateMachine.ts defines state handling used by booking workflows.
- **Payment reconciliation:** supabase/functions/payment-webhook, supabase/functions/reconcile-stripe-payments, and related payment functions separate payment claims from verified records.
- **Role boundaries:** src/lib/permissions.ts and database access policies distinguish guest, staff, management, and property-level access.
- **Operational traceability:** booking and staff audit trails make state changes inspectable.
- **Human-directed AI:** external messages and AI suggestions are not supposed to bypass staff approval paths.

For the deeper technical explanation, read [Backend Architecture](docs/backend-architecture.md) and [Backend Component Map](docs/backend-component-map.md).

## Explore the repository

| Location | Purpose |
| --- | --- |
| [src/pages](src/pages) | Guest, staff, front-desk, booking, reporting, and administrative screens |
| [src/components](src/components) | Reusable operational UI and workflow elements |
| [src/lib](src/lib) | Booking rules, financial calculations, permissions, and domain logic |
| [src/hooks](src/hooks) | Data access and application state hooks |
| [supabase/functions](supabase/functions) | Server-side booking, payment, messaging, and operational integrations |
| [supabase/migrations](supabase/migrations) | Database schema, policy, and lifecycle changes |
| [docs](docs) | Architecture and platform-specific technical notes |
| [roadmap.md](roadmap.md) | Work completed, verification gates, and remaining follow-ups |

## Local development

This repository is a connected full-stack application, not a zero-configuration static site. A usable environment requires the appropriate Supabase project configuration, migrations, authentication setup, and any external provider credentials for the features being exercised. **Do not commit production credentials or customer data.**

~~~bash
git clone https://github.com/Maxmax284/ground-stay-truth.git
cd ground-stay-truth
npm install
npm run dev
~~~

Available development checks:

~~~bash
npm run lint
npm run test
npm run build
~~~

The npm scripts are provided in package.json; listing them here does not imply that they have been freshly executed or that all checks currently pass.

## Current scope and honest limits

- The [roadmap](roadmap.md) records outstanding staff-device verification and MFA-dependent workflow checks.
- Some after-hours escalations and operational capabilities have explicit rollout gates; presence in code does not mean a feature is switched on.
- Messaging, Stripe, notifications, and flight-provider features require configuration and operational verification.
- The repository contains product-specific policies and branding. Reusing it for another property would require careful configuration, testing, and authorization.

## Who this work is relevant to

This project demonstrates an approach to **custom operations software**: business rules, customer-facing journeys, staff tooling, payments, external integrations, and accountable data changes working together.

**Engineering / portfolio:** [Maxwell Wolfe on GitHub](https://github.com/Maxmax284) · [Nocturne Labs](https://nocturnelabs.dev/)

*Built from an operational hospitality use case, not a generic dashboard template.*
