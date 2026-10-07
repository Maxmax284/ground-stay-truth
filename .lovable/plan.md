# Warm Ring Canvas — soften light/dark contrast

Goal: kill the bleach-white vs jet-black whiplash across staff and guest screens, keep the Lamai fight-camp identity. Colors only — no layout, behavior, or feature changes.

## What changes (what you'll see)
- White backgrounds become warm canvas/parchment; cards a hair lighter so they still lift off the page.
- Pitch-black panels (sidebar, Camp Pass tickets, Corner Talk, departure-board bits) become deep warm charcoal, so dark and light pieces feel like the same room.
- Borders go from cold office gray to a soft warm brass-gray.
- Red and blue stay as the red/blue corner identity but slightly calmer; status badges become soft tinted pills instead of solid bright blocks.
- Cards get a soft warm shadow instead of harsh lines.
- Text: near-black warm ink instead of pure black; in dark mode, warm bone instead of pure white.
- Dark mode gets the same warm treatment (charcoal, not black).

## Technical details
- `src/index.css` tokens only (`:root` and `.dark`):
  - `--background 38 18% 97%`, `--card/--popover 38 20% 99%`, `--muted 36 16% 93%`, `--border/--input 36 12% 86%`, `--foreground 30 10% 12%`.
  - `--fight-dark` and `--sidebar-background` -> `30 10% 11%`; sidebar border/accent warm-shifted.
  - `--primary`/`--destructive` red ~`0 62% 46%`, info blue ~`217 60% 46%`; gold/terracotta unchanged.
  - Add `--shadow-card` warm shadow token; apply in `.camp-pass`, card base classes.
  - `.dark`: background `30 8% 9%`, card `30 8% 12%`, foreground `36 18% 90%`.
- Sweep components for hardcoded `bg-white`, `bg-black`, `text-white`, `bg-amber-500`, `bg-red-*`, `bg-blue-*` solids (e.g. preview banner in `DashboardLayout.tsx`, legend/badges) and swap to tokens or `/10` tinted pills.
- Verify with Playwright screenshots (guest portal light+dark, landing, auth) at 390px and 1280px; check text contrast stays at WCAG AA.
- Save design decision to memory (Design Direction).

## Not touched
Bookings, payments, messaging, layout, animations, routes.
