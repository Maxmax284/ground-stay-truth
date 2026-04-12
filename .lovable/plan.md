# Operational Intelligence Layer — Refinement Plan

## Current State (Already Built)

The core system exists and is functional:

- **Database**: `intelligence_entries` table with RLS (admin CRUD, staff read active, guest read active+audience-filtered)
- **Data**: 11 entries seeded (8 Playbook, 3 Heads Up)
- **Components**: `IntelligenceEditor`, `GuestHeadsUpStrip`, `GuestPlaybook`, `StaffIntelStrip` — all wired into Settings, GuestPortal, and Dashboard
- **AI Integration**: Edge function injects active entries into context (lines 908-948)
- **Lifecycle**: Promote flow (Heads Up → Playbook + archive) working
- **No "Ask AI" remnants** — already uses "Ask Kru Glitch"

## Gaps to Address

### 1. Expand Location Tags

The `LOCATIONS` array in `IntelligenceEditor.tsx` and the `IntelligenceLocation` type in `useIntelligence.ts` are missing `phuket`, `pattaya`, and `transit`. The `GuestPlaybook.tsx` and `StaffIntelStrip.tsx` location label maps also need these additions.

**Files**: `useIntelligence.ts`, `IntelligenceEditor.tsx`, `GuestPlaybook.tsx`, `StaffIntelStrip.tsx`

### 2. Lookout Layer (Admin-Only Draft Suggestion System)

Not yet built. This is a background intelligence suggestion system that monitors patterns and generates draft entries for admin review.

**Implementation**: Add a "Lookout" section within `IntelligenceEditor.tsx` that:

- Shows a "Scan for Patterns" button (admin only)
- Calls the AI assistant with a specialized prompt asking it to analyze recent guest questions, repeated issues, and system patterns
- Returns suggested draft entries that load directly into the editor as `status: draft`
- Never auto-publishes, never notifies, never interacts with guests/staff
- This extends the existing "Suggest Draft" button into a more structured pattern-analysis tool

**No new components needed** — this enhances the existing `IntelligenceEditor` with a dedicated "Lookout" section below the entry list.

### 3. Guest Heads Up Strip — Location Awareness

Currently `GuestHeadsUpStrip` accepts optional `locations` prop but is rendered in GuestPortal without passing locations. It should derive the guest's arrival location from their active booking's arrival model and pass it through.

**Files**: `GuestPortal.tsx` (derive location from booking's arrival data and pass to `GuestHeadsUpStrip`)

### 4. Expires_at Enforcement

Client-side filtering in `useIntelligence.ts` already filters expired entries. This is sufficient — no changes needed.

### 5. Seed Additional Location-Specific Entries

Add Phuket and Pattaya playbook entries for the expanded location support, plus a transit-specific entry.

**Method**: Database insert (not migration)

## Implementation Steps


| Step | What                                                                                  | Files                                                                                      |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | Add `phuket`, `pattaya`, `transit` to location type, LOCATIONS arrays, and label maps | `useIntelligence.ts`, `IntelligenceEditor.tsx`, `GuestPlaybook.tsx`, `StaffIntelStrip.tsx` |
| 2    | Pass derived guest location to `GuestHeadsUpStrip` in GuestPortal                     | `GuestPortal.tsx`                                                                          |
| 3    | Add Lookout section to `IntelligenceEditor` with pattern-analysis prompt              | `IntelligenceEditor.tsx`                                                                   |
| 4    | Seed new entries for phuket, pattaya, transit contexts                                | Database insert                                                                            |


**No new files created. No new tables. No new edge functions. No architectural changes.**

&nbsp;

&nbsp;

Ensure the expanded location model (phuket, pattaya, transit) is consistently applied across all intelligence layers, including filtering, tagging, and UI display, so the system reflects real travel context rather than a limited regional scope.

&nbsp;

Ensure GuestHeadsUpStrip receives and uses the actual derived arrival/location data from the booking model in GuestPortal, eliminating any fallback or generic behavior and guaranteeing fully context-aware delivery.

&nbsp;

Ensure the Lookout Layer remains strictly a draft suggestion system within IntelligenceEditor, with zero auto-publish, zero guest/staff exposure, and full admin control over all outputs before activation.

&nbsp;

Ensure all newly seeded entries (phuket, pattaya, transit) are written with the same concise, practical, and real-world tone as existing Playbook entries, avoiding generic or overly descriptive content.

&nbsp;

Ensure no additional dashboards, feeds, or parallel systems are introduced; all intelligence creation, review, and promotion must remain centralized within the existing IntelligenceEditor workflow.

&nbsp;

Ensure the system maintains strict separation between Heads Up (temporary, real-time awareness) and Playbook (permanent, validated knowledge), with no duplication or overlap between the two layers.

&nbsp;

Ensure all AI responses (Kru Glitch) prioritize approved Playbook and Heads Up entries as primary sources, avoiding generic fallback responses and maintaining consistent tone and accuracy across all interactions.