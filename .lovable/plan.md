# Kru Glitch answer discipline + on-page spotlight

Polish pass. No new panels, no dashboard redesign. Two halves: make simple questions get simple answers, and let the assistant point at records already on screen.

## 1. Answer discipline (intent depth)

Today the assistant always gets the same `RESPONSE_STRUCTURE` block (QUICK ANSWER / WHAT I FOUND / SUGGESTED NEXT STEP / SOURCES), so "who's checking in today?" comes back as a formatted essay.

Fix: classify the question before the model call and swap the response contract.

- New `src/lib/aiIntent.ts` — pure classifier returning `simple_lookup | operational_summary | deep_analysis | action_request`, driven by keyword/shape rules (lookup verbs + today/free/owes/missing, "explain/why/audit/break down/full details", "assign/move/draft/prepare").
- The classified intent rides along in the existing request body as `intent`.
- In `supabase/functions/ai-assistant/index.ts`, add an intent-specific response contract layer (replacing `RESPONSE_STRUCTURE` when intent is simple/summary):
  - `simple_lookup`: no section headers. Lead with the count, then one line per record: name — room — status. No preamble, no background, no SOURCES block. Explicit banned phrasings ("Based on your operational data", "comprehensive breakdown", "After reviewing", "Operationally speaking"). Empty result = "No check-ins today." Uncertain = plain one-liner about what's unassigned/pending. End with a single optional "Want more detail?" line.
  - `operational_summary`: 3–7 bullets, worst first, no section headers.
  - `deep_analysis`: keep the current structured format unchanged.
  - `action_request`: unchanged — Plan → Approve → Execute, draft only.
- Token ceiling drops for simple lookups (`max_tokens` ~180) so long answers are physically hard to produce.
- Page context already flows via `focused_context`; add an explicit instruction: booking focus → default to that booking unless the user says "all"/"across the platform"; page key → prefer that domain.

Nothing changes about which data is fetched, role gating, PII minimization, or Control Mode.

## 2. Spotlight state

New `src/lib/spotlightStore.ts` — same tiny `useSyncExternalStore` pattern as `aiFocusStore.ts`:

```text
{ kind: booking|payment|task|unit|pickup|document|maintenance,
  ids: string[], reason?, source: 'kru_glitch'|'shortcut', at, durationMs }
```

`setSpotlight`, `clearSpotlight`, `useSpotlight()`. Auto-expires on a timer.

New `src/components/ai/SpotlightLayer.tsx` (mounted once, alongside the existing `AIFocusHighlighter`):
- finds `[data-spotlight-kind="booking"][data-spotlight-id="<id>"]`
- adds a soft ring + background flash class, scrolls the first match into view
- fades out after the duration, then clears
- under `prefers-reduced-motion`, applies a static outline/background instead of pulse
- adds a small "Focused" badge attribute on the first match only

Highlight classes live in `src/index.css` as semantic-token utilities (`.kg-spotlight`, `.kg-spotlight-static`) — no hardcoded colors.

## 3. Mark up existing rows (no new UI)

Add `data-spotlight-kind` / `data-spotlight-id` attributes to rows/cards that already render:
- Front Desk booking cards (`SectionList` items), `PickupStatusStrip` rows, `TurnoverBoard` task rows, `OperationalAlerts` rows
- Bookings list rows
- Housekeeping task rows and payment rows where they already exist

Attributes only — no layout or logic change.

## 4. Shortcut chips → answer + spotlight

New `src/lib/aiShortcuts.ts` mapping each shortcut key (`check_ins_today`, `check_outs_today`, `payments_due`, `missing_documents`, `housekeeping_today`, `airport_pickups_today`, `open_maintenance`, `unpaid_balances`, `needs_attention`) to: the prompt text, the spotlight kind, and a resolver that picks matching IDs from data already loaded in page hooks.

Behavior when a chip is pressed:
- stay on the current route, no navigation, no drawer
- send the short prompt through the existing `sendMessage` path with `intent: simple_lookup`
- set the spotlight for matching IDs present in the DOM
- if nothing matches on this page, the reply says so and names where to open them; no forced navigation

Chips render in the existing quick-prompt row in `QuickPrompts.tsx` / the assistant panel — same component, extra entries.

## 5. Tests

`src/lib/__tests__/aiIntent.test.ts` — the sample questions map to the right intent; global wording ("across the whole platform") flips scope; action phrasing stays `action_request`.
`src/lib/__tests__/spotlightStore.test.ts` — set/clear, expiry, no cross-kind bleed.
`src/lib/__tests__/aiShortcuts.test.ts` — each shortcut key resolves prompt + kind + IDs from a fixture dataset; empty dataset yields an empty match set.

Existing suites and typecheck must stay green.

## Out of scope

No new dashboards/drawers/modals, no changes to booking/payment/document/housekeeping fetches, no changes to Ops Control Mode, elevation, drafts, or permissions.
