# Multi-Property Architecture for Ground Stay

## Overview

Transform the single-property Ground Stay platform into a unified multi-property system supporting Lamai Muay Thai (high-turnover) and Koh Shanti Guesthouse (long-stay), with strict data isolation enforced at the database level via RLS, a property context layer in the UI, and adaptive dashboards.

## Critical: Fix Existing Runtime Error First

The `BookingDetailSheet` has a "Rendered more hooks than during the previous render" error caused by the early return (`if (!booking) return null`) at line 141 being placed after conditional hooks. This must be fixed before any architectural work.

---

## Phase 1 — Database Foundation

### 1.1 Create `properties` table

```sql
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,        -- 'lamai' | 'koh-shanti'
  name text NOT NULL,
  operational_mode text NOT NULL DEFAULT 'high_turnover',  -- 'high_turnover' | 'long_stay'
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  settings jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Seed with two rows: Lamai Muay Thai (`high_turnover`) and Koh Shanti Guesthouse (`long_stay`).

### 1.2 Create `user_property_assignments` table

Maps users to properties. Most users get one property; umbrella operators (Nikki, Ralph) get multiple.

```sql
CREATE TABLE public.user_property_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, property_id)
);
```

### 1.3 Add `property_id` column to core tables

Add a `property_id uuid REFERENCES public.properties(id)` column (nullable initially for migration, then backfill) to:

- `units` — primary property assignment
- `bookings` — inherited from unit at creation
- `airport_pickups` — inherited from booking
- `housekeeping_tasks` — inherited from unit
- `maintenance_requests` — inherited from unit
- `laundry_requests` — inherited from unit
- `drivers` — can serve multiple properties (junction table or array)
- `messages` — inherited from booking
- `notifications` — no change needed (user-scoped already)

### 1.4 Create `has_property_access` security definer function

```sql
CREATE FUNCTION public.has_property_access(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_property_assignments
    WHERE user_id = _user_id AND property_id = _property_id
  )
$$;
```

### 1.5 Update RLS policies

Every existing staff SELECT/INSERT/UPDATE policy on property-scoped tables gains an additional `AND has_property_access(auth.uid(), property_id)` condition. Admin policies also get this check — admins see only properties they are assigned to (umbrella admins are assigned to all).

### 1.6 Housekeeping mode support

Add `cleaning_mode text NOT NULL DEFAULT 'event_based'` to `units` table. Values: `event_based` (triggered on checkout, Lamai default) or `scheduled` (weekly recurring, Koh Shanti default). The existing `auto_create_housekeeping_task` trigger continues for event-based; a new cron-driven edge function generates recurring tasks for scheduled units.

---

## Phase 2 — Frontend Property Context Layer

### 2.1 `PropertyProvider` context

New React context (`src/hooks/useProperty.tsx`) that:

- On auth, fetches user's property assignments from `user_property_assignments`
- Auto-selects the default property (or sole property)
- Exposes: `activeProperty`, `properties` (all assigned), `switchProperty()`, `isUmbrella` (has 2+ properties), `operationalMode`
- Wraps inside `AuthProvider` in `App.tsx`

### 2.2 Property indicator in header

Add a subtle property badge/selector to `DashboardLayout` header:

- Single-property users: static badge showing property name
- Umbrella operators: dropdown to switch active property
- Color-coded by property (e.g., red for Lamai, teal for Koh Shanti)

### 2.3 Scope all data hooks

Every data-fetching hook (`useDashboard`, `useBookings`, `useUnits`, etc.) adds `.eq("property_id", activePropertyId)` to its queries. The `activePropertyId` comes from `useProperty()`.

---

## Phase 3 — Adaptive Dashboards

### 3.1 Dashboard mode adaptation

The existing `Index.tsx` dashboard reads `operationalMode` from `useProperty()` and conditionally adjusts:

**High-turnover mode (Lamai):**

- Top stats: Today's Arrivals, Today's Departures, Active Bookings, Pending Pickups
- Prominent: TodaysPickupsWidget, FlightForecastWidget, ApprovalQueue
- Activity feed emphasizes check-ins/outs happening now

**Long-stay mode (Koh Shanti):**

- Top stats: Active Long-Term Guests, Upcoming Arrivals (7-day), Scheduled Housekeeping, Open Maintenance
- Prominent: Weekly housekeeping schedule, MaintenanceQueue, upcoming arrivals list
- Activity feed emphasizes weekly flow and ongoing stays

### 3.2 Shared components, different priorities

No new dashboard pages. The same components render but are ordered and configured differently via the `operationalMode` flag. Components like `TodaysPickupsWidget` simply show nothing if there are no pickups for that property.

---

## Phase 4 — System-Wide Property Scoping

### 4.1 Airport pickups

- `airport_pickups` gets `property_id` (inherited from booking's property)
- Pickup queues filter by active property
- Driver assignment respects property assignment
- Travel state logic unchanged — just scoped

### 4.2 Guest portal

- Guest experience unchanged visually
- Booking data automatically scoped to the property the booking belongs to
- No property selector for guests

### 4.3 AI assistant

- Pass `activeProperty` context to AI edge function calls
- AI responses scoped to property data only

### 4.4 Settings & policies

- `policy_settings` gains optional `property_id` column for per-property overrides
- Null `property_id` = global default; property-specific row overrides it

---

## Migration Strategy

1. Create tables and columns
2. Backfill: set all existing data to the Lamai property ID
3. Make `property_id` NOT NULL after backfill
4. Update RLS policies
5. Deploy frontend changes

## File Changes Summary


| Area        | Files                                                            |
| ----------- | ---------------------------------------------------------------- |
| Database    | 1 large migration (tables, columns, RLS, functions, seed data)   |
| Context     | New `src/hooks/useProperty.tsx`                                  |
| Layout      | `DashboardLayout.tsx` (property indicator), `App.tsx` (provider) |
| Hooks       | All data hooks (~20 files) add property filter                   |
| Dashboard   | `Index.tsx`, `useDashboard.ts` (mode-adaptive)                   |
| Auth        | `useAuth.tsx` unchanged; property resolved separately            |
| Permissions | `permissions.ts` unchanged; property is orthogonal to role       |
| Bug fix     | `BookingDetailSheet.tsx` (hooks ordering)                        |


## Estimated Scope

This is a ~15-step implementation spanning database schema, RLS, context providers, hook refactoring, and dashboard adaptation. It will be executed incrementally, with the database foundation first, then the context layer, then progressive scoping of each subsystem.

---

## Additional Implementation Safeguards and Refinements

Enforce property inheritance at the database level rather than relying on frontend logic. Any record that derives from another entity must automatically inherit and validate its property_id. Bookings must inherit property_id from units, airport_pickups from bookings, and messages or related records from their parent entities. This should be enforced through database constraints, triggers, or validation logic to prevent mismatches or accidental cross-property data contamination.

Avoid using array-based property assignments for shared roles such as drivers. Implement a proper junction table (e.g., driver_property_assignments) to map drivers to one or multiple properties. This ensures clean querying, easier permission enforcement, and long-term maintainability.

Keep housekeeping logic strictly limited to two operational modes: event-based (for high-turnover properties like Lamai) and scheduled (for long-stay properties like Koh Shanti). Do not introduce additional variations or conditional complexity beyond these two modes. The system should remain predictable and easy to reason about.

Ensure dashboard adaptation is controlled at the composition level rather than deeply embedded within individual components. Shared components should remain consistent and reusable, with layout, ordering, and visibility determined by the operational_mode. Avoid embedding excessive conditional logic inside components that could lead to inconsistent behavior or debugging complexity.

Make the active property context visually clear and persistent across the entire interface. While maintaining a clean UI, ensure there is no ambiguity about which property the user is currently operating within. This is critical for preventing operational mistakes, especially for umbrella-level users switching between properties.

Enforce strict data-level scoping for the AI layer. The AI must only receive and operate on data relevant to the active property context. Do not rely solely on prompt instructions to enforce separation. Backend queries and data payloads must already be filtered to the correct property before being passed to the AI.

Define clear precedence rules for policy settings. If a property-specific policy exists, it must override the global default. If no property-specific policy exists, the system falls back to the global setting. Avoid merging or blending configurations dynamically, as this introduces ambiguity and increases the risk of inconsistent behavior.

Audit all existing queries and hooks for implicit single-property assumptions. Any logic that previously assumed a single global dataset must be updated to explicitly filter by property_id. This includes edge cases in dashboards, background processes, notifications, and any derived calculations.

Ensure that all system-generated processes (such as housekeeping task creation, pickup coordination, and notifications) are property-aware and scoped correctly. Background jobs and edge functions must respect property boundaries in the same way as user-facing queries.

Maintain strict separation between properties while preserving a unified system architecture. The goal is to support multiple operational environments without introducing duplication, fragmentation, or cross-property leakage. The system should feel cohesive while remaining logically isolated where required.

---
---

# GroundsDay Arrival Ecosystem — System Audit & Implementation Plan

> **Date**: 2026-04-03  
> **Scope**: Audit + extension plan. No new systems. No parallel workflows. Strict alignment with existing architecture.

---

## 0. Architectural Invariants (Non-Negotiable)

| Rule | Enforcement |
|------|-------------|
| **Single source of truth** for pickup data = `airport_pickups` table | All components read from this; no shadow state |
| **Single source of truth** for checklist data = `pre_arrival_checklist` table | Keyed by `(booking_id, item_key)` |
| **Travel state** computed by `getTravelState()` in `src/lib/travelState.ts` | Never stored; always derived |
| **Confidence** computed by `evaluateAssistMode()` in same file | Output written to `airport_pickups.assist_mode` |
| **assist_mode lifecycle**: `healthy → degraded → manual_assist → recovery_pending → healthy` | Never skips steps; admin-gated recovery |
| **Human overrides persist** through recovery | System resumes from *current state*, not stale state |
| **All actions logged** in `stay_support_log` | `[MANUAL]` or `[ADMIN]` prefix for human-driven changes |
| **AI never mutates state** | Read-only suggestions, draft-only outputs |
| **Guest messages from non-admin staff are drafts** until admin approval | `messages.draft = true` |

---

## 1. Pre-Arrival Checklist System

### 1.1 Current State ✅

- **13 items** across 6 sections defined in `usePreArrivalChecklist.ts`
- **5 critical keys**: `connectivity_readiness`, `confirm_domestic_flight`, `tdac_completed`, `upload_id`, `confirm_arrival_time`
- Stored in `pre_arrival_checklist` table with `(booking_id, item_key)` uniqueness
- TDAC links to `https://tdac.immigration.go.th`
- `connectivity_readiness` stored in checklist `data` JSON field
- Guest UI: accordion-based with section progress badges

### 1.2 Checklist Item Coverage

| Required Item | item_key | Status |
|---------------|----------|--------|
| TDAC | `tdac_completed` | ✅ Critical, with link |
| International flight | `international_flight_noted` | ✅ Info item |
| Domestic flight | `confirm_domestic_flight` | ✅ Critical, syncs with pickup |
| Connectivity readiness | `connectivity_readiness` | ✅ Critical |
| Insurance awareness | `insurance_awareness` | ✅ Safety section |
| Money awareness | `money_awareness` | ✅ Local Setup |
| Driving awareness | `driving_awareness` | ✅ Safety section |
| Pickup understanding | `transport_awareness` | ✅ Local Setup (label: "Understand how pickup works after landing") |
| Lamai living orientation | `camp_rules_ack` | ✅ Living section |

**All requested items exist.** No new item_keys needed.

### 1.3 Checklist → System Integration Points

| Consumer | How It Reads Checklist | Current Status |
|----------|----------------------|----------------|
| `evaluateAssistMode()` | Receives `checklistCriticalMissing: string[]` | ✅ Implemented |
| `useUpsertAirportPickup` | Syncs `confirm_domestic_flight` on flight save | ✅ Implemented |
| Corner Talk | Queries `pre_arrival_checklist` for bookings ≤3 days | ✅ Implemented |
| Staff pickup views | Shows ⚠ badge for critical gaps | ✅ Implemented |
| `getArrivalReadiness()` | **Not yet implemented** | ⚠️ Defined below |

### 1.4 New Function: `getArrivalReadiness()`

**Location**: `src/lib/travelState.ts`

```typescript
export interface ArrivalReadiness {
  ready: boolean;           // All critical items complete
  score: number;            // 0-100, all items
  blockers: string[];       // Human-readable list of issues
  missingCritical: string[]; // item_key values
}

export function getArrivalReadiness(
  checklistItems: { item_key: string; completed: boolean }[],
  pickup: PickupData | null
): ArrivalReadiness
```

**Logic**:
- Checks 5 critical keys against completed items
- Generates human-readable blockers for each missing critical item
- Cross-references pickup data (e.g., skip "No Samui flight" blocker if `pickup.flight_number` exists even without checklist completion)
- Returns `ready: true` only when all 5 critical items are complete

**How readiness affects decision-making**:

| Readiness State | Impact |
|----------------|--------|
| `ready: true` | System operates at full confidence; no additional signals |
| `ready: false`, 1-2 missing | Degraded confidence signals fed to `evaluateAssistMode` |
| `ready: false`, ≥3 missing + API issues | Compound trigger → `manual_assist` |
| `connectivity_readiness` missing | Special degraded reason: "Guest may be unreachable after landing" |

---

## 2. Arrival System

### 2.1 Component Audit ✅

| Component | File | Status |
|-----------|------|--------|
| Flight tracking | `check-flight-status` edge function + `flight_tracking` table | ✅ |
| International + domestic legs | `airport_pickups.international_flight_number` + `flight_number` | ✅ |
| Landed confirmation | `LandedConfirmationDialog.tsx` — transit-aware, mismatch detection | ✅ |
| Travel state engine | `getTravelState()` — 7 states: pre_departure, missing_final_flight, awaiting_departure, in_transit_bkk, arriving, arrived, cancelled | ✅ |
| Pickup dispatch guard | `canDispatchDriver()` checks `operationallyReady` | ✅ |
| Welcome Guide | `ArrivalWelcomeGuide.tsx` with airport-specific TDAC content | ✅ |
| Guest pickup card | `GuestPickupCard.tsx` — guidance per travel state + manual assist reassurance | ✅ |

### 2.2 Arrival Behavior by Checklist State

| Scenario | Connectivity | Samui Flight | System Response |
|----------|-------------|-------------|-----------------|
| Checklist complete | ✅ | ✅ | Full automation |
| Partial (non-critical only missing) | ✅ | ✅ | Full automation, staff warnings only |
| Connectivity missing | ❌ | ✅ | **Degraded** — flight tracked but guest unreachable |
| Samui flight missing | ✅ | ❌ | **Degraded** — `missing_final_flight` state, no dispatch |
| Both missing | ❌ | ❌ | **Degraded** (2 signals) |
| Both + API failure | ❌ | ❌ | **Manual assist** (≥3 compound signals) |

### 2.3 No Structural Changes Needed

The arrival system already:
- Consumes `flight_number` from `airport_pickups` (single source)
- Uses `getTravelState()` for all UI decisions
- Handles missing data gracefully (every state has `staffDetail` + `guestGuidance`)
- Depends on connectivity implicitly (guest can't tap "I've Landed" without internet)

---

## 3. Health / Confidence Layer

### 3.1 `evaluateAssistMode()` Signal Matrix ✅

| Signal | Source | Effect |
|--------|--------|--------|
| `locationMismatch` | Guest confirmed ≠ flight tracking | → `manual_assist` (hard trigger) |
| `flightApiError` | AviationStack failure | → degraded |
| Flight data stale (> threshold) | `flight_tracking.last_checked_at` | → degraded |
| `flightStatus === "not_found"` | AviationStack response | → degraded |
| `translationFailed` | `translate-message` edge function | → degraded |
| Missing `connectivity_readiness` | `checklistCriticalMissing[]` | → degraded |
| Missing `confirm_domestic_flight` | `checklistCriticalMissing[]` | → degraded |
| Missing `tdac_completed` | `checklistCriticalMissing[]` | → degraded |
| **≥3 degraded reasons** | Compound | → `manual_assist` (auto-escalation) |
| Already `manual_assist` / `recovery_pending` | Stored mode | → no auto-change (sticky) |

### 3.2 Gap: Server-Side Confidence Evaluation

Currently `evaluateAssistMode` runs **client-side only**. The `check-flight-status` edge function updates `flight_tracking` but does **not** evaluate system confidence or update `airport_pickups.assist_mode`.

**Recommended extension**: When `check-flight-status` runs:
1. Query `pre_arrival_checklist` for the booking
2. Compute critical missing items
3. Call `evaluateAssistMode` logic server-side
4. Write result to `airport_pickups.assist_mode` + `assist_reason`

This ensures confidence is evaluated even when no staff client is open.

### 3.3 `isSystemHealthy()` for Recovery ✅

Already implemented — validates all signals before allowing `recovery_pending → healthy` transition. Checks: no API errors, no mismatches, no translation failures, flight data fresh.

---

## 4. Manual Assist System

### 4.1 Current State ✅

| Feature | Implementation | Status |
|---------|---------------|--------|
| Auto-trigger: ≥3 degraded signals | `evaluateAssistMode()` | ✅ |
| Auto-trigger: location mismatch | `evaluateAssistMode()` | ✅ |
| Manual trigger: staff escalation | `ManualAssistBanner.handleEscalateToManual()` | ✅ |
| Banner: degraded | Yellow, "Reduced Confidence" | ✅ |
| Banner: manual_assist | Red, "Automation Paused" | ✅ |
| Banner: recovery_pending | Blue, "Awaiting Approval" | ✅ |
| Staff: Contact Guest | Deep-link `#messages-{bookingId}` | ✅ |
| Staff: Edit flights with [MANUAL] prefix | `AirportPickupSection.handleSaveFlights()` | ✅ |
| Recovery: Mark ready (Manager+) | `handleMarkRecoveryReady()` | ✅ |
| Recovery: Resume (Admin only) | `handleResumeAutomation()` | ✅ |
| Audit logging | `logPickupAction()` → `stay_support_log` | ✅ |
| Corner Talk | 3 signals: active, degraded, recovery | ✅ |

### 4.2 Confirmed: Checklist Alone Does NOT Trigger Manual Assist ✅

- Checklist gaps produce degraded reasons only
- 1-2 checklist gaps = `degraded`
- ≥3 total degraded reasons (checklist + other signals) = `manual_assist`
- Checklist provides **context** for manual assist, not the sole trigger

### 4.3 Extension: Structured Reason Display

Currently `assist_reason` is a concatenated string. For manual assist context, parse into bullet points in `ManualAssistBanner` so staff sees:
- "• Guest has not confirmed internet access"
- "• Flight data is 45 minutes old"
- "• Guest has not confirmed Samui flight"

### 4.4 Messaging ↔ Manual Assist Integration

- "Contact Guest" → opens messaging for the booking
- Messages sent during manual assist carry `[MANUAL ASSIST]` context for AI drafts
- Admin can apply received info via override actions (§6)
- Manual assist pauses automation but does NOT prevent messaging

---

## 5. Messaging System (Operational Intake Layer)

### 5.1 Current State ✅

- Real-time inbox with `messages` table
- Guest-facing messages from non-admin staff → `draft = true`
- AI draft suggestions via Kru Glitch
- Translation via `translate-message` edge function
- Read status tracking via `read_at`

### 5.2 Future Extension: Attachments

| Element | Design |
|---------|--------|
| Storage | Existing `guest-documents` storage bucket |
| Schema | Add `attachment_url` (text, nullable) and `attachment_type` (text, nullable) to `messages` table |
| Guest upload | File picker in message composer → upload to storage → save URL |
| Staff upload | Same mechanism |
| Display | Inline thumbnail for images; download link for PDFs |
| RLS | Same as existing message policies (guest sees own, staff sees all) |

### 5.3 Future Extension: Message-Based Data Intake

Messages become a **source** of operational data through admin interpretation:

```
Guest sends message ("Here's my flight: PG123 arriving 2pm")
  → AI suggests: "This looks like domestic flight PG123"
  → Admin sees Action Card in message thread
  → Admin clicks "Use as Samui Flight"
  → System writes to airport_pickups.flight_number = "PG123"
  → Checklist item confirm_domestic_flight auto-completes
  → Action logged: [ADMIN] flight_number_override, source: message {id}
```

### 5.4 AI Interpretation Contexts

| Context | When | AI Does |
|---------|------|---------|
| `message_interpretation` | Guest sends message with potential data | Extracts flight numbers, dates, document types; presents as suggestions |
| `arrival_guidance` | Guest asks about arrival | Drafts guidance using travel state + airport facts |
| `manual_assist` | System in manual assist | Explains situation, suggests staff actions, drafts calming guest messages |

---

## 6. Admin Override Layer

### 6.1 Design

Admins extract information from any source and apply it to system fields through explicit, logged actions. This is the system's correction mechanism.

### 6.2 Override Action Catalog

| Action Label | Target | Fields Written |
|-------------|--------|---------------|
| "Use as International Flight" | `airport_pickups` | `international_flight_number` |
| "Use as Samui Flight" | `airport_pickups` | `flight_number`, `final_flight_confirmed = true` |
| "Set Arrival Time" | `airport_pickups` | `arrival_datetime` |
| "Mark TDAC Complete" | `pre_arrival_checklist` | `item_key: tdac_completed`, `completed: true` |
| "Save as Document" | `guest_documents` | `file_name`, `file_path`, `booking_id` |
| "Assume Connectivity" | `pre_arrival_checklist` | `item_key: connectivity_readiness`, `completed: true`, `data: {assumed_by_admin: true}` |
| "Override Arrival Airport" | `airport_pickups` | `confirmed_airport` |

### 6.3 Logging

Every override writes to `stay_support_log`:

```
{
  booking_id,
  request_type: "admin_override",
  request_id: pickup_id or checklist_item_id,
  action: "[ADMIN] flight_number_override",
  note: "Applied from message {message_id}: PG123 as domestic flight",
  from_status: previous_value,
  to_status: new_value,
  change_type: "override"
}
```

### 6.4 Implementation Location

- Admin-only action menu in booking detail view (not a new page)
- "Apply from message…" → recent messages → pick action type → confirm
- All changes flow through existing upsert hooks

### 6.5 Constraints

- Only `admin` role can execute overrides
- Guests never mutate system fields directly
- Overrides persist through recovery (manual → recovery → healthy)
- Recovery resumes from current state (including overrides), never reverts to stale data

---

## 7. AI Role (Kru Glitch) — Boundaries

### 7.1 Permissions

| ✅ Allowed | ❌ Never |
|-----------|---------|
| Read booking/checklist/travel/message data | Execute actions |
| Explain situations | Override data |
| Draft guest messages (output = draft) | Dispatch drivers |
| Interpret attachments → suggest data | Change system state |
| Surface confidence context | Approve messages |

### 7.2 Context Injection

When AI processes a booking, it receives:
- Booking metadata (state, dates, guest type)
- `getTravelState()` output
- `getArrivalReadiness()` output
- Current `assist_mode` + `assist_reason`
- Recent messages (last 5)
- **Never**: raw API responses, internal IDs, other bookings

---

## 8. Staff Visibility Audit

### 8.1 Current Surfaces ✅

| View | Shows | Status |
|------|-------|--------|
| Booking Detail (`AirportPickupSection`) | Travel state, flight route, assist mode, flight editing | ✅ |
| Today's Pickups Widget | Travel state per pickup, assist mode (compact), flight delays | ✅ |
| Guest Pickup Card | Guest guidance, driver info, manual assist reassurance | ✅ |
| Corner Talk | Checklist gaps, manual assist, recovery, missing drivers | ✅ |

### 8.2 Extensions Needed

| Gap | Location | Fix |
|-----|----------|-----|
| Checklist completion % on booking detail | `BookingDetailSheet` | Add badge: "3/5 critical ✅, 72% overall" |
| Connectivity status on pickup widgets | `TodaysPickupsWidget` | Query checklist, show ⚠ if missing |
| TDAC missing indicator | `AirportPickupSection` | Check checklist, show warning |
| Structured assist reason | `ManualAssistBanner` | Parse string → bullet points |

### 8.3 Staff Labels

| Gap | Staff Sees |
|-----|-----------|
| No Samui flight | "⚠ Missing Final Flight — pickup timing unavailable" |
| No connectivity | "⚠ No Connectivity Plan — guest unreachable after landing" |
| TDAC missing | "⚠ TDAC Missing — may delay immigration" |
| No ID | "⚠ ID Not Uploaded — check-in blocked" |

---

## 9. Notifications & Corner Talk

### 9.1 Guest Notifications (Max 3 Automated)

| # | Trigger | Content |
|---|---------|---------|
| 1 | Booking confirmed | "Booking confirmed — complete your pre-arrival checklist" |
| 2 | 3 days before arrival | "Your arrival is in 3 days — complete your checklist" |
| 3 | 1 day before arrival | "Your pickup is confirmed for tomorrow" |

### 9.2 Staff Notifications (Corner Talk) ✅

All implemented in `corner-talk/index.ts`:
- `checklist_no_connectivity` (≤3 days, Attention)
- `checklist_no_samui_flight` (≤3 days, Attention)
- `checklist_critical_gaps` (≤3 days, Attention)
- `manual_assist_active` (any active, Urgent)
- `manual_assist_degraded` (any active, Attention)
- `manual_assist_recovery` (admin only, Attention)

---

## 10. Data Integrity Rules

| Rule | Enforcement |
|------|-------------|
| Single source: flights → `airport_pickups` | No flight data in bookings or checklist |
| Single source: checklist → `pre_arrival_checklist` | `bookings.pre_arrival_status` is summary only |
| Single source: flight cache → `flight_tracking` | Client never stores flight data |
| Overrides always logged | `stay_support_log` with `[ADMIN]`/`[MANUAL]` prefix |
| Manual changes survive recovery | System resumes from current state, never reverts |
| No silent overwrites | Every field change via override produces audit entry |
| Recovery requires admin approval | `recovery_pending → healthy` gated by admin role |
| Stale data → degraded, never reverted | `evaluateAssistMode` degrades on staleness |

---

## 11. End-to-End System Flow

```
1. BOOKING CONFIRMED
   └─ Checklist seeded (13 items in pre_arrival_checklist)
   └─ Guest notification #1: "Complete your checklist"

2. GUEST COMPLETES CHECKLIST (partial/full)
   └─ Each toggle → upsert pre_arrival_checklist
   └─ TDAC → links to tdac.immigration.go.th
   └─ Domestic flight → syncs to airport_pickups.flight_number
   └─ getArrivalReadiness() recalculated

3. DATA FEEDS INTO CONFIDENCE
   └─ getChecklistProgress() → criticalMissing[]
   └─ evaluateAssistMode({ checklistCriticalMissing })
   └─ Missing items → degraded signals

4. FLIGHT TRACKING ACTIVATES
   └─ check-flight-status polls AviationStack
   └─ Results → flight_tracking table
   └─ API errors → degraded signal

5. NOTIFICATIONS FIRE
   └─ 3 days before: "Complete your checklist" (#2)
   └─ 1 day before: "Pickup confirmed for tomorrow" (#3)
   └─ Corner Talk surfaces gaps to staff

6. GUEST LANDS → "I'VE LANDED"
   └─ LandedConfirmationDialog → airport selection
   └─ BKK + connecting → in_transit_bkk (no dispatch)
   └─ USM → arriving (dispatch enabled)
   └─ Mismatch → staff flagged, possible manual_assist

7. ISSUES DETECTED
   └─ 1-2 signals: degraded (yellow banner)
   └─ ≥3 signals: manual_assist (red banner, automation paused)
   └─ Staff contacts guest via messaging

8. ADMIN OVERRIDE (if needed)
   └─ Admin extracts info from messages/attachments
   └─ Applies via action menu → writes to airport_pickups/checklist
   └─ Logged with [ADMIN] prefix

9. RECOVERY
   └─ Manager: "System Ready — Request Approval"
   └─ Admin: "Resume Automation"
   └─ assist_mode → healthy
   └─ Automation continues from current state (overrides preserved)
```

---

## 12. Identified Gaps & Priority

| # | Gap | Severity | Phase |
|---|-----|----------|-------|
| 1 | `getArrivalReadiness()` not implemented | Medium | 1 |
| 2 | Server-side confidence evaluation missing | Medium | 2 |
| 3 | Checklist badge not on booking detail | Medium | 1 |
| 4 | Assist reason not structured (single string) | Low | 1 |
| 5 | Connectivity status not on pickup widgets | Medium | 1 |
| 6 | No attachment support in messages | High | 3 |
| 7 | No admin override UI | High | 4 |
| 8 | Guest notifications (3-day, 1-day) not verified | Medium | 2 |

### Implementation Phases

**Phase 1 — Foundation** (low risk):
- Add `getArrivalReadiness()` to `travelState.ts`
- Add checklist badge to booking detail
- Parse assist reason into bullet points

**Phase 2 — Server Confidence** (medium risk):
- Extend `check-flight-status` to evaluate assist mode server-side
- Verify/implement scheduled guest notifications

**Phase 3 — Messaging Intake** (high value):
- Add attachment columns to `messages` table
- Build attachment upload/display
- Add AI message interpretation context

**Phase 4 — Admin Override** (high value):
- Build admin override action menu
- Implement "Use as…" action cards
- Full audit logging for overrides
