

# Fix Kru's Data Accuracy -- Always Ground Responses in Real Data

## The Problem

The edge function (`supabase/functions/ai-assistant/index.ts`) only fetches real database context for two modes:
- `digest` / `summarize` -- queries bookings, maintenance, laundry
- `validate` -- uses the transition context passed from the client

The other three modes (`explain`, `draft`, and any general conversation) send **no operational data at all**. The AI has zero context about the actual property, so it invents facts. Your database has 1 unit called "Testing" -- Kru said 6 because it was guessing.

## The Fix

Fetch a **baseline context snapshot** for EVERY request, regardless of mode. This gives Kru a grounded picture of the property at all times. Then layer mode-specific data on top.

### Baseline Context (fetched on every request)

Query the database for a compact snapshot:
- **Units:** count, names, active status
- **Active bookings:** count by state
- **Open maintenance:** count
- **Active laundry:** count

This gets injected into the system prompt as a "PROPERTY SNAPSHOT" section so Kru always knows the real state of affairs.

### Mode-Specific Context (layered on top)

- `digest` / `summarize`: Add the detailed booking/maintenance/laundry records (already implemented)
- `validate`: Add the transition context (already implemented)
- `explain` / `draft`: No extra data needed beyond the baseline

### System Prompt Addition

Add a hard rule to the prompt:

```
ACCURACY:
- ONLY reference data provided in the PROPERTY SNAPSHOT below. 
- If you don't have data to answer a question, say so. Never guess or invent numbers.
- "I don't have that info right now" is always better than a wrong answer.
```

## Technical Changes

### File: `supabase/functions/ai-assistant/index.ts`

1. Move database queries BEFORE the mode switch so a baseline always runs
2. Query a compact snapshot:
   - `units` table: select name, is_active (all units)
   - `bookings` table: count by state for active states
   - `maintenance_requests`: count open/in_progress
   - `laundry_requests`: count not collected
3. Build a `PROPERTY SNAPSHOT` string injected into every system prompt
4. Keep the existing detailed queries for digest/summarize as additional context
5. Add the accuracy rule to `buildSystemPrompt`

### File: `src/components/AIAssistantPanel.tsx`

No changes needed -- the client already passes `mode` correctly.

### Example of the baseline context injected into the prompt

```
PROPERTY SNAPSHOT (source of truth -- do not contradict):
Units: 1 total (1 active). Names: Testing.
Active bookings: 0 confirmed, 0 checked_in, 0 pending_approval.
Open maintenance requests: 0.
Active laundry requests: 0.
```

This is compact (a few lines) so it doesn't bloat the prompt, but it prevents Kru from ever making up unit counts, booking numbers, or property details again.

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/ai-assistant/index.ts` | Add baseline data fetch for all modes, add accuracy rules to system prompt |

No new files. No new dependencies. Just making the existing edge function always query the real data before responding.
