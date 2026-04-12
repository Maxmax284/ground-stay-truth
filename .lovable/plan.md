# Operational Intelligence Layer — Architecture Plan

## What Already Exists (Reusable)

### Surfaces

- **Corner Talk** (`CornerTalkPanel.tsx` + edge function): Staff-only real-time awareness strip at top of dashboard. Role-filtered, severity-ranked, dismiss logic, deep-links to AI. This IS the existing "Heads Up" for internal ops.
- **Arrival Welcome Guide** (`ArrivalWelcomeGuide.tsx` + `ArrivalWelcomeEditor.tsx` + `GuidedSectionEditor.tsx`): Location-aware structured content (sections + photos) stored in `policy_settings` as JSON. Admin-editable with AI drafting assistance. Already supports BKK, USM, Nathon, Lipa Noi, Bus.
- **Fact Sheets** (`airportFactSheets.ts`): 1,049 lines of hardcoded, verified location data — ATMs, transport, SIM cards, customs, piers, bus. Structured by location. Already feeds the AI drafting engine.
- **Stay Essentials** (`useStayEssentials.ts` + `StayEssentialsEditor.tsx`): WiFi, house rules, emergency contacts with unit-level overrides. Already injected into AI context for guests.
- **Pre-Arrival Checklist** (`PreArrivalChecklist.tsx`): Progress-tracked guest tasks (TDAC, documents, connectivity).
- **Policy Settings** (`policy_settings` table): Key-value store with property scoping, history tracking, admin-controlled. The universal structured content backend.
- **AI Assistant** (`ai-assistant/index.ts`): 1,083-line edge function with 12 behavioral layers, role-based context injection, PII masking, weather/AQI, server-side role derivation. Already consumes fact sheets + stay essentials + booking data as context.
- **Notification System**: Unified push + foreground banner pipeline. Events already wired for bookings, messages, payments, reviews.
- **Role System**: 7-tier hierarchy with `has_role` security definer, `permissions.ts` for route/action gating.

### Key Insight

The platform already has the "Heads Up" concept (Corner Talk) and the "Playbook" concept (Arrival Guides + Fact Sheets + Stay Essentials). What's missing is:

1. A **guest-facing Heads Up** surface
2. A **generalized Playbook** that extends beyond arrival-specific content
3. A **promotion flow** from temporary alert → permanent knowledge
4. AI integration that pulls from approved Playbook entries

---

## Proposed Architecture

### Data Model — One New Table

```sql
CREATE TABLE public.intelligence_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('heads_up', 'playbook')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  title text NOT NULL,
  body text NOT NULL,
  location text[], -- ['bkk', 'samui', 'nathon', 'lipa_noi', 'island', 'global']
  category text NOT NULL, -- 'money', 'transport', 'safety', 'connectivity', 'customs', 'health', 'local_life'
  audience text[] NOT NULL DEFAULT '{guest,staff}', -- who sees it
  severity text DEFAULT 'normal', -- for heads_up: 'urgent', 'attention', 'normal'
  image_url text,
  image_caption text,
  sort_order int DEFAULT 0,
  expires_at timestamptz, -- null = permanent (playbook default)
  promoted_from uuid REFERENCES intelligence_entries(id), -- heads_up → playbook lineage
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid, -- admin who published
  property_id uuid REFERENCES properties(id), -- null = global
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE intelligence_entries ENABLE ROW LEVEL SECURITY;
```

RLS: Staff (front_desk+) can read active entries. Guests can read entries where `'guest' = ANY(audience)` and status = 'active'. Admin can CRUD all.

### No Parallel Systems

- **Heads Up for staff** stays in Corner Talk. The new `intelligence_entries` with `type='heads_up'` supplements Corner Talk with location/context awareness items (ATM warnings, ferry delays) — NOT operational booking alerts.
- **Arrival Guides** stay as-is in `policy_settings`. Playbook entries are a separate, browsable knowledge layer — not a replacement.
- **Fact Sheets** remain hardcoded as the verified foundation. Playbook entries are the admin-curated "street knowledge" layer on top.

---

## UX Design

### 1. Guest Experience

**Heads Up Strip** — Slim, dismissible card(s) shown in the Guest Portal between the Stay Summary and booking details. Max 2 visible at once. Context-filtered by:

- Guest's arrival location (BKK vs USM vs pier)
- Guest's travel stage (pre-arrival, checked-in, departing)
- Location tags on the entry

Example: Guest arriving via BKK sees "ATM tip: Press NO on Dynamic Currency Conversion" with a small ATM image.

**Playbook Access** — New tab in Guest Portal: "Island Guide" (or "Local Guide"). Clean card grid, categorized. Each card shows title, 1-2 line summary, optional photo. Tap to expand full content. "Ask Kru Glitch" button on each card to deep-link into AI with that topic pre-loaded.

**Flow**: Heads Up → tap "Learn more" → opens relevant Playbook entry → "Still have questions?" → opens AI with context.

### 2. Staff Experience

**Corner Talk stays unchanged** for operational alerts. A new "Intel" badge/section below Corner Talk shows active `heads_up` entries tagged for staff — so staff know what guests are seeing and can reference it.

**Playbook** accessible from Settings or a dedicated nav item. Staff see the same content guests see plus staff-only entries (e.g., "How to handle taxi complaints at Nathon").

### 3. Admin Experience

**Intelligence Editor** — New section in Settings (or Policy Settings tab). Simple list + editor:

- Create entry: type (Heads Up / Playbook), title, body, category, location tags, audience checkboxes, optional image, optional expiry
- "Promote to Playbook" button on any Heads Up entry (creates a new Playbook entry linked via `promoted_from`, archives the Heads Up)
- Status flow: Draft → Active (requires admin) → Archived
- No AI auto-publishing. AI can suggest draft entries (future), admin approves.

---

## AI Integration

The `ai-assistant` edge function gets a new context block:

```
INTELLIGENCE LAYER (approved operational knowledge — cite when relevant):
ACTIVE HEADS UP:
- [money/bkk] ATM: Always press NO on currency conversion...
- [transport/samui] Grab wait times currently 15-20min...

PLAYBOOK HIGHLIGHTS (top entries by category):
- [money] ATM Realities: Yellow ATMs (Krungsri) attached to banks...
- [transport] Songthaew Guide: Red/yellow trucks, loop routes...
```

Fetched from `intelligence_entries` where status = 'active', scoped by property. Max ~20 entries injected to stay within token budget.

When a user clicks "Ask Kru Glitch" from a Heads Up or Playbook card, the AI receives the entry as pre-seeded context so it can explain without starting cold.

---

## Location Scoping

Each entry has a `location text[]` array. Values: `bkk`, `samui`, `nathon`, `lipa_noi`, `bus`, `island` (general Koh Samui), `global` (everywhere).

Guest-facing filtering uses the guest's detected arrival location (already resolved by `detectAirport()` + arrival model). Staff see all entries but with location badges for context.

Future locations added by simply using new tag values — no schema changes.

---

## Intelligence Lifecycle

```text
Admin creates Heads Up (draft)
  → Admin publishes (active)
    → Shown to relevant audience based on location/role
      → Optional: Admin promotes to Playbook
        → New Playbook entry created, Heads Up archived
          → AI references Playbook entry in context
```

Expiry: Heads Up entries can have `expires_at`. A scheduled function or client-side filter hides expired entries. Playbook entries are permanent by default.

---

## What Should NOT Be Built

- No feed/timeline UI. No infinite scroll. No "news" aesthetic.
- No separate content management system. Use the existing `policy_settings` pattern extended to the new table.
- No AI auto-publishing or AI-generated entries going live without admin approval.
- No duplication of Corner Talk logic. Corner Talk remains the operational pulse; intelligence entries are the contextual knowledge layer.
- No restructuring of Arrival Guides — they serve a different purpose (step-by-step arrival instructions vs. general knowledge).
- No complex tagging taxonomy. Flat category + location arrays are sufficient.
- No separate admin dashboard. The editor lives inside existing Settings.

---

## Implementation Summary


| Component                          | Type               | Purpose                                           |
| ---------------------------------- | ------------------ | ------------------------------------------------- |
| `intelligence_entries` table + RLS | Migration          | Single data store                                 |
| `IntelligenceEditor.tsx`           | New component      | Admin CRUD + promote flow                         |
| `GuestHeadsUpStrip.tsx`            | New component      | Guest-facing contextual alerts (max 2)            |
| `GuestPlaybook.tsx`                | New component      | Browsable knowledge cards in Guest Portal         |
| `StaffIntelStrip.tsx`              | New component      | Staff awareness of active intel below Corner Talk |
| `ai-assistant/index.ts` update     | Edge function edit | Inject active intelligence into AI context        |
| `useIntelligence.ts`               | New hook           | Fetch + filter entries by role/location/type      |
| Guest Portal tab addition          | Edit               | Add "Island Guide" tab                            |
| Settings tab addition              | Edit               | Add "Intelligence" management section             |


**Total new files**: ~5 components + 1 hook + 1 migration  
**Existing files edited**: ai-assistant edge function, GuestPortal.tsx, Settings.tsx, Index.tsx (staff strip)

&nbsp;

Keep the intelligence_entries table as a dedicated data layer. Do not merge this into policy_settings or any existing JSON-based storage. This system needs a clean, structured home to avoid long-term chaos.

&nbsp;

Maintain a strict separation between Corner Talk and the intelligence layer. Corner Talk remains operational (bookings, alerts, internal events). Intelligence entries handle environmental awareness (ATMs, taxis, ferries, real-world behavior). Do not mix these.

&nbsp;

Limit category expansion. Keep categories tight and controlled: money, transport, safety, connectivity, customs, local_life. Do not allow category sprawl or over-specific labels.

&nbsp;

Limit location tags to a controlled set: bkk, samui, nathon, lipa_noi, bus, island, global. Do not overcomplicate location taxonomy.

&nbsp;

Keep Playbook entries short, direct, and actionable. No long-form content. No paragraphs of explanation. Each entry should feel like a 10-second real-world tip, not a guidebook article.

&nbsp;

Use visuals wherever possible in Playbook entries. If something can be shown (ATM color, card type, location reference), include an image. This reduces confusion significantly.

&nbsp;

Limit Heads Up display to a maximum of 2 entries at a time. More than that reduces effectiveness and leads to user fatigue.

&nbsp;

Ensure Heads Up entries are contextual and filtered: by location (arrival model) by user stage (pre-arrival, on-arrival, during stay) by audience (guest vs staff)

&nbsp;

Do not allow Heads Up to become a scrolling feed or timeline. No infinite scroll, no news-style UI.

&nbsp;

Keep the Playbook clean and structured. It should feel like a practical reference, not a blog or content hub. Avoid unnecessary depth in navigation.

&nbsp;

Restrict staff-only intelligence entries. Only create staff-specific entries when they solve a repeated operational issue. Do not allow this to become an internal wiki or opinion-based content pool.

&nbsp;

Enforce admin approval on all intelligence entries. No auto-publishing. No AI-generated content goes live without explicit admin approval.

&nbsp;

Keep the promotion flow strict: Heads Up → repeated pattern → promoted to Playbook → Heads Up archived. Do not duplicate entries between layers.

&nbsp;

Ensure AI only consumes approved intelligence_entries data. Do not allow AI to generate or invent local advice outside of this layer.

&nbsp;

Limit AI context injection to concise entries. Do not pass long-form text into the AI context. Keep entries short to maintain response quality and speed.

&nbsp;

Ensure AI responses remain short by default. Expand only when the user asks follow-up questions. Avoid over-explaining.

&nbsp;

Use visuals and labels in the Playbook to reinforce recognition: ATM colors, bank names, physical references. Reduce reliance on text alone.

&nbsp;

Keep the UI minimal and non-intrusive: Heads Up = subtle banner Playbook = clean card grid AI = contextual expansion

&nbsp;

Do not introduce modals, popups, or aggressive interruptions for this system.

&nbsp;

Ensure staff visibility of guest-facing intelligence. Staff must see what guests see to maintain alignment and avoid contradictory information.

&nbsp;

Avoid building a separate admin dashboard. The intelligence editor must live inside existing Settings or Policy structures.

&nbsp;

Do not over-engineer tagging, filtering, or hierarchy. Keep structure flat and manageable.

&nbsp;

Ensure the system remains location-aware at all times. Content must adapt based on where the user is (BKK, Samui, pier, island, etc.), not display generic “Thailand tips.”

&nbsp;

Preserve system tone: direct, practical, slightly assertive not corporate not overly friendly not instructional in a lecture style

&nbsp;

Do not allow this system to feel like content consumption. It must feel like real-time assistance and practical guidance.

&nbsp;

Ensure the system evolves cleanly: temporary reality → Heads Up repeated reality → Playbook AI explains both without duplication

&nbsp;

Maintain performance awareness. Do not overload the client or AI context with excessive entries or large payloads.

&nbsp;

Keep everything aligned with the core principle: deliver the right information at the right moment without adding friction or clutter.