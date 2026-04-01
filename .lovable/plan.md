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

&nbsp;

&nbsp;

Additional Implementation Safeguards and Refinements

&nbsp;

Enforce property inheritance at the database level rather than relying on frontend logic. Any record that derives from another entity must automatically inherit and validate its property_id. Bookings must inherit property_id from units, airport_pickups from bookings, and messages or related records from their parent entities. This should be enforced through database constraints, triggers, or validation logic to prevent mismatches or accidental cross-property data contamination.

&nbsp;

Avoid using array-based property assignments for shared roles such as drivers. Implement a proper junction table (e.g., driver_property_assignments) to map drivers to one or multiple properties. This ensures clean querying, easier permission enforcement, and long-term maintainability.

&nbsp;

Keep housekeeping logic strictly limited to two operational modes: event-based (for high-turnover properties like Lamai) and scheduled (for long-stay properties like Koh Shanti). Do not introduce additional variations or conditional complexity beyond these two modes. The system should remain predictable and easy to reason about.

&nbsp;

Ensure dashboard adaptation is controlled at the composition level rather than deeply embedded within individual components. Shared components should remain consistent and reusable, with layout, ordering, and visibility determined by the operational_mode. Avoid embedding excessive conditional logic inside components that could lead to inconsistent behavior or debugging complexity.

&nbsp;

Make the active property context visually clear and persistent across the entire interface. While maintaining a clean UI, ensure there is no ambiguity about which property the user is currently operating within. This is critical for preventing operational mistakes, especially for umbrella-level users switching between properties.

&nbsp;

Enforce strict data-level scoping for the AI layer. The AI must only receive and operate on data relevant to the active property context. Do not rely solely on prompt instructions to enforce separation. Backend queries and data payloads must already be filtered to the correct property before being passed to the AI.

&nbsp;

Define clear precedence rules for policy settings. If a property-specific policy exists, it must override the global default. If no property-specific policy exists, the system falls back to the global setting. Avoid merging or blending configurations dynamically, as this introduces ambiguity and increases the risk of inconsistent behavior.

&nbsp;

Audit all existing queries and hooks for implicit single-property assumptions. Any logic that previously assumed a single global dataset must be updated to explicitly filter by property_id. This includes edge cases in dashboards, background processes, notifications, and any derived calculations.

&nbsp;

Ensure that all system-generated processes (such as housekeeping task creation, pickup coordination, and notifications) are property-aware and scoped correctly. Background jobs and edge functions must respect property boundaries in the same way as user-facing queries.

&nbsp;

Maintain strict separation between properties while preserving a unified system architecture. The goal is to support multiple operational environments without introducing duplication, fragmentation, or cross-property leakage. The system should feel cohesive while remaining logically isolated where required.