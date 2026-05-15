# Ground Stay Brand Cleanup + Accommodation Showcase

Two surgical changes. No new media system, no new dashboard, no schema migration.

---

## 1. Brand typo fix: "GroundsDay" → "Ground Stay"

Audit confirmed **8 occurrences across 7 landing-page files** (all guest-facing copy). No DB tables, routes, or technical IDs are affected.

Files to edit (text-only string swaps):
- `src/components/landing/EntrySection.tsx` (×2 — heading + watermark `GROUNDSDAY` becomes `GROUND STAY`)
- `src/components/landing/BuiltFromInsideSection.tsx` (×2)
- `src/components/landing/ComplianceSection.tsx` (×1)
- `src/components/landing/FailureSection.tsx` (×1)
- `src/components/landing/FinalCTASection.tsx` (×1)
- `src/components/landing/ProofSection.tsx` (×1)
- `src/components/landing/SovereigntySection.tsx` (×1)

Everywhere else (PWA title, i18n locales, sidebar, push toast, embeds, Stay hero, footer, edge-function copy) already says **Ground Stay** — verified via grep.

---

## 2. Accommodation Showcase block on `/stay`

Reuse existing infrastructure: **`policy_settings`** table (already stores `camp_info` as JSON, already publicly readable, already editable via `PolicySettingsForm`) and **existing `units.photos[]`** as the image source. No new table, no new bucket.

### Storage shape

New `policy_settings` row, key = `stay_showcase`, value = JSON:

```json
{
  "enabled": true,
  "layout": "hero_fade",        // hero_fade | card_carousel | gallery_strip
  "autoplay": true,
  "speed": "normal",            // slow | normal | fast
  "transition": "fade",         // fade | slide
  "image_fit": "cover",         // cover | contain
  "show_captions": true,
  "show_indicators": true,
  "slides": [
    {
      "id": "uuid",
      "image_url": "https://…",   // typically a URL already in units.photos
      "caption": "Fighter's Studio",
      "alt": "Studio room interior with twin beds",
      "link_unit_id": "uuid|null", // optional — clicking scrolls to that unit
      "link_url": null,            // optional override
      "active": true,
      "order": 0
    }
  ]
}
```

### New file: `src/components/AccommodationShowcase.tsx`

Public, read-only renderer used on `/stay`.
- Reads `stay_showcase` JSON via the same anon REST pattern already used for `camp_info` in `Stay.tsx`.
- Three layouts:
  - **hero_fade** — single full-width image (16/9 desktop, 4/5 mobile), crossfade between slides
  - **card_carousel** — Embla carousel (already in deps), 1 card on mobile / 2–3 on desktop, swipeable, dot indicators
  - **gallery_strip** — horizontally scroll-snapped row, 1 visible on mobile, 3 on desktop
- Autoplay pauses on hover/focus and respects `prefers-reduced-motion`.
- Click on a slide with `link_unit_id` → smooth-scrolls to `#unit-{id}` on the same page (we add that id to `UnitCard`'s wrapper).
- Empty state (no active slides): renders a quiet placeholder card — "Room photos coming soon — villas and camp rooms will appear here." No fake stock images.
- If `enabled: false` or block missing: renders nothing (graceful absence).

### Placement on `/stay`

In `src/pages/Stay.tsx`, render `<AccommodationShowcase />` **immediately below the hero `<header>` and above the units `<main>`**. This keeps the booking flow as the page's primary purpose.

### Admin editor: `src/components/AccommodationShowcaseEditor.tsx`

Lives inside the existing Settings → Policies area (same surface as `PolicySettingsForm`). Added as a new tab/section "Stay Showcase" — does **not** spawn a new page or dashboard.

Editor controls:
- Image source picker — dropdown of existing `units` with their `photos[]`, plus a free-text URL field for non-unit images. No new uploader.
- Per-slide: caption, alt text, optional unit link, active toggle, drag handle for reorder.
- Block-level: enabled toggle, layout select, autoplay toggle, speed (slow/normal/fast), transition (fade/slide), image fit (cover/contain), show captions, show indicators.
- Live mini-preview rendering the same `AccommodationShowcase` component with current draft state.
- Helper text under the editor: *"Use real room/villa photos. Avoid blurry images. Landscape works best. Don't use stock photos."*

Persisted via the existing `usePolicySettings` upsert mutation (admin-only RLS already enforced).

### Mobile behavior

- One slide visible, swipeable (Embla `dragFree: false`).
- Indicators are minimal dots, tap-able.
- No hover-only effects; captions always visible when enabled.
- Touch targets ≥ 44px.

---

## Technical Notes

- **No migration required.** `policy_settings` already exists, anon-readable, admin-writable. Just a new key.
- **No types.ts edit.** JSON value column accepts the new shape as-is.
- **i18n.** Editor labels added to `src/i18n/locales/en.json` only (others fall back to English) — out of scope for non-English on first pass.
- **Reuse:** Embla (`embla-carousel-react`) already installed for `src/components/ui/carousel.tsx`.
- **Anchor links:** Add `id={`unit-${unit.id}`}` to each `UnitCard` wrapper so showcase slides can deep-link.

---

## Validation Checklist

- [ ] `rg -i groundsday` returns zero matches
- [ ] `/stay` hero still says "Ground Stay" and renders showcase below it
- [ ] All three layouts render correctly on 384px and 1280px widths
- [ ] Mobile swipe + dot indicators work
- [ ] Captions show/hide per setting
- [ ] Disabled toggle hides block with no layout shift
- [ ] Empty slides → friendly placeholder (no broken images)
- [ ] Clicking a slide with `link_unit_id` scrolls to that unit
- [ ] Settings editor saves and the public page reflects changes after refresh
- [ ] Landing page (`/`) renders without "GroundsDay" anywhere
