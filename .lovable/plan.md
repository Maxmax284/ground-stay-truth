# Ground Stay — Room Assignment & Availability Audit

Read-only audit. Nothing in this plan modifies schema, data, or code. The "Implementation Plan" section is a forward-looking proposal staged for a future build cycle.

---

## SECTION 1 — Current Architecture

### 1.1 Inventory model (Hybrid: Room Type → Physical Units)

Two tables drive inventory:

- `unit_groups` — the **Room Type** (e.g. `Superior Single`, `Standard Single`, `Sea View Villa (Lower Level)`). Holds name, description, sort_order, is_active.
- `units` — the **Physical Room** (e.g. `Superior Single 1`, `Superior Single 2`). Holds capacity, pricing, amenities, photos, group_id → unit_groups, is_active, sort_order, property_id.

```text
unit_groups (Room Type)         units (Physical Room)
┌──────────────────────┐        ┌──────────────────────────┐
│ Superior Single      │ 1───*  │ Superior Single 1 [act]  │
│                      │        │ Superior Single 2 [inact]│
│                      │        │ Superior Single 3 [inact]│
│                      │        │ Superior Single 4 [inact]│
└──────────────────────┘        │ Superior Single 5 [inact]│
                                └──────────────────────────┘
```

**Live data snapshot (24 units total):**

- Superior Single → **1 active of 5** (#1 active; #2–5 inactive)
- Standard Single → **1 active of 6** (#11 active; #12–16 inactive)
- Superior Twin → **1 active of 3**
- Superior Double → **1 active of 2**
- Sea View Villa (Lower Level) → **1 active of 5**
- Sea View Villa (Higher Level) → **2 active of 2**
- Sea View Villa - 2 Bedroom → 1 active of 1

This is the single most important finding: **the database supports sequential physical rooms, but almost all siblings are flagged** `is_active = false`**.** Auto-assignment cannot pick rooms that don't exist as active inventory.

### 1.2 Booking model

`bookings` carries exactly one `unit_id` (FK to physical unit). There is no `quantity`, no `unit_group_id`, no children/legs. **A booking = one physical room for one date range.** Multi-room reservations are not a first-class concept.

### 1.3 Two ways a booking gets a `unit_id`


| Path                   | File                                                                                                         | Behavior                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest request flow** | `src/components/GuestBookingRequestForm.tsx` + `src/hooks/useAutoAssignUnit.ts` → edge fn `auto-assign-unit` | Guest picks a **room type (group)**. The edge function returns the first available physical unit in that group by `sort_order`. The client then submits the booking with that `unit_id`. |
| **Staff manual flow**  | `src/components/BookingFormDialog.tsx`                                                                       | Staff picks a **specific physical unit** from a Select. No auto-assign.                                                                                                                  |


### 1.4 Availability engine

Three sources, each with slightly different rules — the most important architectural risk in the system:


| Surface                            | Source                                                | Blocking states considered                                                                  |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Public embed / `/stay`             | `supabase/functions/get-availability`                 | `pending_approval, pending_deposit, confirmed, checked_in` (NOT `inquiry`, NOT `soft_hold`) |
| Auto-assign on submit              | `supabase/functions/auto-assign-unit`                 | `inquiry, soft_hold, pending_approval, pending_deposit, confirmed, checked_in`              |
| DB overlap trigger (authoritative) | `check_booking_overlap()`                             | `soft_hold, pending_approval, pending_deposit, confirmed, checked_in` (NOT `inquiry`)       |
| State-machine constant             | `BLOCKING_STATES` in `src/lib/bookingStateMachine.ts` | `soft_hold, pending_approval, pending_deposit, confirmed, checked_in`                       |


`maintenance_blocks` is also factored into both edge functions but not by the DB trigger.

### 1.5 Calendar & front-desk surfaces

- **Calendar** (`CalendarGrid`, `CalendarDayView`, `CalendarMonthView`) renders one row per physical unit (`useUnits()` returns **all** units regardless of `is_active`). Bookings are positioned by `unit_id`. Drag-drop allows changing `unit_id`; overlap is enforced by the DB trigger.
- **Booking detail sheet** shows `units(name)` join — the physical room name.
- **Front desk** (`useFrontDesk.ts`) also joins `units(name)` — shows the physical room. So staff already see the exact assigned room everywhere a booking is rendered.

### 1.6 Housekeeping interaction

`auto_create_housekeeping_task()` fires when a booking transitions to `completed`. It creates a turnover task with a due time using `cleaning_buffer_hours`, but **housekeeping status does not feed availability**. A unit becomes bookable again the moment `check_out` passes (subject to state filters above). The cleaning buffer is a scheduling hint for staff, not a hard gate.

---

## SECTION 2 — Current Problems

1. **Inconsistent "blocking state" sets across surfaces** (1.4). The public embed treats `inquiry` and `soft_hold` as bookable — auto-assign treats them as blocked — the DB trigger treats `soft_hold` as blocked but not `inquiry`. A guest browsing `/stay` can request a room that auto-assign will refuse, and an `inquiry` booking does not actually hold the room at the DB level.
2. **Race condition window in auto-assign.** `useAutoAssignUnit` is a React Query read; the assignment isn't atomic with the insert. Two concurrent guests can both receive `Superior Single 1`, both submit, and the DB trigger rejects the loser with a raw Postgres error. There is no retry/re-pick on the client.
3. `get-availability` **group mode over-blocks.** In group mode it returns the union of all units' blocked ranges instead of intersection. A date is presented as blocked even if only one of N siblings is occupied. Comment in the code acknowledges this and defers to auto-assign at submit time, but the calendar widget on `/stay` shows wrong unavailability.
4. **Effective inventory is artificially small.** Most sibling units are `is_active = false` (Section 1.1). Sequential allocation (`Superior Single 1 → 2 → 3 → 4`) is impossible today because 2/3/4/5 are inactive. This is the real reason "1 of 1 available" appears.
5. **No multi-room booking primitive.** Booking 3 Superior Singles requires three separate bookings, each manually created. There is no group/parent record, no transactional "assign N units" routine.
6. **Calendar shows inactive units** (`useUnits()` doesn't filter `is_active`). This is fine for historical bookings on retired rooms, but combined with #4 it makes the inventory picture confusing for staff.
7. **No cleaning gate on availability.** Back-to-back same-day bookings are technically allowed the moment one checks out — housekeeping completion is not required.
8. **No retry/reassign on overlap rejection.** When `check_booking_overlap` raises, the user sees a database exception rather than a re-attempt against the next available sibling.

---

## SECTION 3 — Risk Assessment


| Risk                                        | Likelihood | Severity | Notes                                                                                                   |
| ------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| Double-booking same unit                    | Low        | High     | DB trigger is authoritative; would surface as a 500. Worst case is poor UX, not overbooking.            |
| Guest sees room available, request fails    | Medium     | Medium   | Caused by problems #1, #2, #3.                                                                          |
| Inquiry "ghosts" — booked in UI, free at DB | Medium     | High     | `inquiry` is not in `check_booking_overlap`, so a second booking on the same dates can pass through.    |
| Wrong room displayed                        | Very low   | —        | All surfaces show the joined physical unit name already.                                                |
| Housekeeping not done before next check-in  | Medium     | Medium   | No availability gate; staff-managed only.                                                               |
| Inventory inflation from inactive units     | None       | —        | All edge functions filter `is_active`. Calendar shows them but cannot book against them via guest flow. |


---

## SECTION 4 — Recommended Architecture

Two complementary changes, in priority order:

### 4.1 Single source of truth for "blocking states"

Create one shared list (`BLOCKING_STATES`) consumed by:

- `check_booking_overlap()` trigger
- `auto-assign-unit`
- `get-availability` (both single and group modes)
- the booking form's local overlap pre-check in `BookingFormDialog.tsx`

Recommendation: include `inquiry` everywhere (an unacknowledged inquiry should still soft-hold the dates) **or** explicitly exclude it everywhere. Pick one and apply it uniformly. The streamlined flow you adopted (inquiry → pending_deposit) makes including `inquiry` the safer default.

### 4.2 Atomic auto-assign at booking creation

Move auto-assignment from a client-side query + separate insert to **one server-side RPC / edge function** that does, inside a single transaction:

```text
1. SELECT … FROM units
   WHERE group_id = :g AND is_active
   AND NOT EXISTS (overlap on bookings in BLOCKING_STATES)
   AND NOT EXISTS (overlap on maintenance_blocks)
   ORDER BY sort_order
   LIMIT :n
   FOR UPDATE SKIP LOCKED   -- key to preventing the race
2. If count < requested, abort with "Not enough rooms".
3. INSERT N bookings (one per locked unit) atomically.
```

`FOR UPDATE SKIP LOCKED` eliminates the race in problem #2.

### 4.3 Multi-room bookings (optional, deferred)

Two viable designs — pick one when you actually need it:

- **Sibling-bookings model**: one parent `bookings` row per physical room, linked by `booking_group_id`. Pricing/payments stay per-room. Lowest schema impact.
- **Single booking with** `unit_assignments` **join table**: `bookings(1) ─*─ booking_units(unit_id, sort_index)`. Cleaner conceptually but requires re-plumbing calendar, front desk, payments, housekeeping.

For your scale, sibling-bookings is recommended.

### 4.4 Cleaning gate (optional)

Add `cleaning_required_until` to `units` that gets bumped on checkout (`check_out + cleaning_buffer_hours`) and cleared when housekeeping marks the task complete. Availability queries then filter on it. Only worth doing if back-to-back same-day issues are real.

### 4.5 Activate the latent inventory

Set `is_active = true` for sibling units you actually rent (`Superior Single 2..5`, `Standard Single 12..16`, etc.) **or** delete them. The current half-active state is the biggest reason auto-assign feels broken — it has nothing to choose from.

---

## SECTION 5 — Migration Impact


| Change                      | Schema migration?                          | Backfill?            | Breaking?                                                           |
| --------------------------- | ------------------------------------------ | -------------------- | ------------------------------------------------------------------- |
| Unify blocking states       | No                                         | No                   | Behavioral only (existing inquiries may start blocking)             |
| Atomic auto-assign RPC      | New SQL function only                      | No                   | Replaces existing `auto-assign-unit` edge logic; thin wrapper stays |
| Activate sibling units      | Data update                                | No                   | Increases calendar height; staff will see new rows                  |
| Sibling-bookings multi-room | Add `booking_group_id uuid` column + index | No (NULL for legacy) | Reports & list views need group-aware totals                        |
| Cleaning gate               | Add `cleaning_required_until` to units     | One-time set NULL    | Tightens availability — flag for staff                              |


No existing booking, payment, or audit row needs to move. All changes are additive.

---

## SECTION 6 — Implementation Plan (proposal — NOT executed)

Phase 0 — Data hygiene (no code)

1. Decide which sibling units are real and `UPDATE units SET is_active = true` for them, or delete dead rows.

Phase 1 — Consistency (low risk)  
2. Centralize `BLOCKING_STATES` in `bookingStateMachine.ts` and consume it from all three edge functions and the local pre-check.  
3. Fix `get-availability` group mode to compute **intersection** (date blocked only if every sibling is blocked).

Phase 2 — Atomic allocation  
4. Add SQL function `assign_units_for_booking(group_id, check_in, check_out, n)` using `FOR UPDATE SKIP LOCKED`.  
5. Rewrite `auto-assign-unit` edge fn as a thin wrapper around the RPC.  
6. Update `GuestBookingRequestForm` to call the RPC at submit (one round trip, atomic).  
7. Surface a friendly "no rooms left in this type" message when the RPC returns less than requested.

Phase 3 — Multi-room (only if requested)  
8. Add `booking_group_id` column.  
9. Extend the RPC to insert N siblings inside the same transaction.  
10. Update list, calendar, and reports to render grouped bookings as one card with N room badges.

Phase 4 — Cleaning gate (optional)  
11. Add `cleaning_required_until` and wire it into availability.

---

## SECTION 7 — Estimated Complexity


| Phase                       | Effort   | Risk                         |
| --------------------------- | -------- | ---------------------------- |
| 0. Data hygiene             | 15 min   | Very low                     |
| 1. State unification        | 1–2 hrs  | Low (behavioral)             |
| 2. Atomic RPC + auto-assign | 3–4 hrs  | Medium (touches insert path) |
| 3. Multi-room siblings      | 1–2 days | Medium-high (cross-cutting)  |
| 4. Cleaning gate            | 2–3 hrs  | Low                          |


Recommendation: do **Phase 0 + Phase 1 + Phase 2** first. That gives you reliable sequential auto-assignment without overbooking, no schema changes beyond a single new SQL function, and lays the groundwork for multi-room later.

---

**Nothing has been changed. Approve the plan and I'll execute the phases you want, in the order you want.**

&nbsp;

Approve and execute Phase 0, Phase 1, and Phase 2 from the Ground Stay Room Assignment & Availability Audit.

&nbsp;

Do not execute Phase 3 multi-room bookings yet.

&nbsp;

Do not execute Phase 4 cleaning gate yet.

&nbsp;

The immediate goal is to make single-room booking assignment reliable, sequential, conflict-free, and consistent across availability, calendar, guest booking, and staff workflows.

&nbsp;

---

&nbsp;

Phase 0 — Data Hygiene

&nbsp;

Review current unit inventory.

&nbsp;

Identify which sibling units are real rentable rooms and should be active.

&nbsp;

Examples:

&nbsp;

- Superior Single 1–5

- Standard Single 11–16

- Superior Twin units

- Superior Double units

- Sea View Villas

&nbsp;

For each unit group:

&nbsp;

- Confirm how many physical rooms are actually rentable.

- Set real rentable units to "is_active = true".

- Keep genuinely unavailable/dead/retired units inactive.

- Do not delete anything unless clearly safe.

- Preserve historical booking references.

&nbsp;

Goal:

&nbsp;

Ground Stay should not show "1 of 1 available" when the business actually has multiple rentable rooms of that type.

&nbsp;

---

&nbsp;

Phase 1 — Blocking State Consistency

&nbsp;

Create one shared source of truth for booking states that block availability.

&nbsp;

Unify blocking-state logic across:

&nbsp;

- "check_booking_overlap()" DB trigger

- "auto-assign-unit"

- "get-availability"

- "BookingFormDialog.tsx" local overlap pre-check

- Booking state machine constants

&nbsp;

Recommended blocking states:

&nbsp;

- inquiry

- soft_hold

- pending_approval

- pending_deposit

- confirmed

- checked_in

&nbsp;

Use this same list everywhere.

&nbsp;

Important:

&nbsp;

If "inquiry" should soft-hold dates, include it everywhere.

&nbsp;

Do not let public availability say a room is available while auto-assign refuses it later.

&nbsp;

Goal:

&nbsp;

Every part of the platform should agree on what counts as occupied, blocked, held, or unavailable.

&nbsp;

---

&nbsp;

Phase 2 — Atomic Room Assignment

&nbsp;

Replace the current client-side "find room first, submit booking later" pattern with server-side atomic assignment.

&nbsp;

Add a SQL function or RPC similar to:

&nbsp;

"assign_units_for_booking(group_id, check_in, check_out, n)"

&nbsp;

The function should:

&nbsp;

1. Look up active units in the selected room group.

2. Exclude units with overlapping bookings in the unified blocking states.

3. Exclude units with overlapping maintenance blocks.

4. Order by "sort_order".

5. Lock candidate rows using "FOR UPDATE SKIP LOCKED".

6. Assign the first available unit.

7. Return a friendly error if no rooms are available.

&nbsp;

The function should prevent race conditions where two guests are assigned the same room at the same time.

&nbsp;

Use this RPC from the guest booking request flow.

&nbsp;

The guest should never receive a raw database overlap error.

&nbsp;

Instead, show a clear message:

&nbsp;

"Sorry, that room type is no longer available for those dates. Please choose another room or date."

&nbsp;

---

&nbsp;

Availability Fix

&nbsp;

Fix "get-availability" group mode.

&nbsp;

Currently, group mode may over-block dates by using the union of blocked ranges.

&nbsp;

Update group availability so a room type is only considered fully unavailable when all active sibling units are blocked.

&nbsp;

Example:

&nbsp;

Superior Single has 5 active rooms.

&nbsp;

If Superior Single 1 is booked, but Superior Single 2–5 are available, the room type should still show available.

&nbsp;

Goal:

&nbsp;

Public availability should reflect actual group inventory, not one blocked room.

&nbsp;

---

&nbsp;

Calendar & Staff Visibility

&nbsp;

Ensure calendar and front desk display the exact assigned physical room.

&nbsp;

Examples:

&nbsp;

- Superior Single 1

- Superior Single 2

- Standard Single 11

&nbsp;

Staff should always know which exact physical room is assigned.

&nbsp;

Do not show only the room type when the physical unit is known.

&nbsp;

---

&nbsp;

Do Not Do Yet

&nbsp;

Do not build multi-room parent booking logic yet.

&nbsp;

Do not add "booking_group_id" yet.

&nbsp;

Do not add "booking_units" join table yet.

&nbsp;

Do not add cleaning hard-gate logic yet.

&nbsp;

Do not make housekeeping completion block availability yet.

&nbsp;

Those are later phases.

&nbsp;

---

&nbsp;

Success Criteria

&nbsp;

After this work:

&nbsp;

- Room assignment is sequential.

- Room assignment skips already booked units.

- Room assignment skips inactive units.

- Room assignment skips maintenance-blocked units.

- Public availability matches real available inventory.

- Guest booking does not fail because the system picked an occupied room.

- Staff can see the exact assigned room on calendar, booking sheet, and front desk.

- No duplicate room assignment occurs under concurrent booking attempts.

- No raw Postgres overlap error reaches the guest.

- "1 of 1 available" only appears when there is genuinely one active room in that group.

&nbsp;

Focus on reliability first.

&nbsp;

Make room assignment boring, predictable, and conflict-free.