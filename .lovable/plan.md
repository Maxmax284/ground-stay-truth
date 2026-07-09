# LMT CampStay → Lamai Hospitality Platform

## 1. What's already here (plain English)

**Bookings & inventory.** The platform has a full booking engine. Rooms live in a `units` table with photos, amenities, capacity, price, weekly/monthly rates, min-nights, WiFi, house rules, emergency contacts. Units can be grouped (`unit_groups`) and tied to a `property`. Bookings run through a 9-state machine (inquiry → soft hold → pending approval → pending deposit → confirmed → checked in → completed, plus cancel/no-show paths). Overlaps, occupancy caps, and turnovers are enforced by database triggers.

**Payments & deposits.** Deposits, booking fees, and security deposits are auto-created as pending obligations. Payment links, Stripe webhooks, refund flow, tax invoices, and reconciliation are all wired. Nothing here should be touched.

**Guest side.**

- `/` — public landing (LMT CampStay marketing).
- `/stay` — public catalog (browse rooms, request booking).
- `/auth/guest` — guest sign-in.
- `/guest` — the guest portal: booking details, arrival journey, WiFi/rules (via `get_unit_essentials`), messaging, maintenance/laundry requests, payments, documents, arrival guide, airport pickup info, environmental strip, corner talk, Kru Glitch AI concierge.

**Staff/admin side.** 7-tier role hierarchy (admin → viewer). Full ops surface: `/dashboard`, `/units`, `/bookings`, `/front-desk`, `/calendar`, `/pricing`, `/reports`, `/messages`, `/settings`, `/media-library`, `/monitoring`, `/ops-tower`, `/security-center`, `/disaster-recovery`, `/simulation`, `/guidance-lab`, `/embeds`.

**Embed system.** `/embed/:type/:unitId` iframes (grid, listing, compact, calendar, CTA). Auto-updates from live availability. Used on WordPress and external sites.

**Supporting systems.** Multi-property isolation via RLS; multi-language (9 locales); PWA + push notifications; airport pickup + flight tracking; housekeeping turnover; intelligence entries (heads-up / playbooks by location + category); Fenrir lock integration; Vanta signal bridge; MCP server for AI assistants; disaster recovery snapshots.

**What "GroundStay" means today.** Zero visible "GroundStay" strings remain — the brand label everywhere uses `t("auth.groundStay")` which returns "LMT CampStay" in all 9 locales. Only internal identifiers (`groundStay` translation key, `ground-truth-hub` project slug, some code comments) still reference the old name. Safe to leave those alone.

## 2. Recommended approach — expand, don't rebuild

Everything below is additive. The booking flow, payment flow, guest portal, admin tools, and embed widgets keep working exactly as they do today. New capabilities layer on top through:

- **Two new columns on** `units` — a listing category (on_site / premium_villa / luxury_villa / long_stay) and a display region (e.g. "hub_area"). Existing rows default to `on_site` so nothing changes for current inventory.
- **One new table** `local_recommendations` — curated nearby services/venues. Staff-only writes, public read for featured entries. No public submission form, ever.
- **Guest portal gets tabs**, not a rewrite — "Your Stay" (current content), "Explore Lamai" (recommendations), "Nearby Services" (utilities like scooter/laundry/clinic), plus an existing "Train" surface for Muay Thai content that stays optional.
- `/stay` **grows a category filter** — the current grid stays, but guests can flip between On-site / Premium Villas / Luxury Villas / Long Stay.
- **Design tokens shift to red / blue / black / white** while keeping the existing `font-stat` uppercase brand treatment. No component rewrites — only token values in `index.css`.

## 3. Staged implementation

### Stage 1 — Foundation (this turn)

1. Migration: add `listing_category` and `region` to `units`; create `local_recommendations` table (name, category, photos, description, address, maps_url, phone, whatsapp, website, opening_hours, distance_note, staff_notes, badges[], featured, is_active, sort_order, property_id) with GRANTs + RLS (staff write, anon read where `featured = true AND is_active = true`).
2. Shift design tokens in `index.css` and `tailwind.config.ts`:
  - `--primary` → LMT red (action / booking CTAs / active states)
  - `--info` / new `--trust` → LMT blue (support / links / confirmations)
  - Base surfaces → white + near-black
  - Keep `--fight-gold` around for the landing page's existing hero, but remove it from primary flows.
3. Verify no visible "GroundStay" string regresses.

### Stage 2 — Listings expansion

1. `/stay` gets category tabs (On-site · Premium Villas · Luxury Villas · Long Stay). Category filter reads `listing_category`.
2. `/units` admin form adds a `listing_category` + `region` dropdown. No existing field is removed.
3. Embed widgets stay unchanged; add one new `browse` variant filtered by category (optional, no breaking change).

### Stage 3 — Curated recommendations

1. New admin page `/recommendations` — CRUD for `local_recommendations` (staff/admin/manager). Photo upload uses existing media library.
2. Badge chips: "Lamai Recommended", "Staff Favorite", plus category chip.
3. Featured toggle + sort order.

### Stage 4 — Guest concierge surfacing

1. Guest portal (`/guest`) grows tabbed layout: **Your Stay** (existing content untouched), **Explore Lamai** (recommendations grid filtered to "food / cafés / beaches / nightlife / attractions"), **Nearby Services** (scooter / laundry / massage / recovery / clinic / pharmacy / grocery / ATM), **Train** (existing training packages, collapsed by default for non-fighters).
2. Each recommendation card: photo, name, distance, badge, tap-to-call, tap-to-WhatsApp, open-in-Maps, website link.
3. Public `/stay` gains a light "Explore Lamai" preview below the room grid to help pre-booking guests picture the destination.

### Stage 5 — Polish

1. Mobile pass on all new surfaces (already the primary viewport).
2. Embed audit — confirm nothing new leaks into iframe pages.
3. Copy pass so training never dominates a vacation guest's screen.

## 4. Technical notes

**Schema additions**

```sql
ALTER TABLE public.units
  ADD COLUMN listing_category text NOT NULL DEFAULT 'on_site',
  ADD COLUMN region text;

CREATE TABLE public.local_recommendations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,          -- food, cafe, scooter, laundry, massage, ...
  description text,
  photos text[] default '{}',
  address text,
  maps_url text,
  phone text,
  whatsapp text,
  website text,
  opening_hours text,
  distance_note text,              -- "5 min walk", "800 m"
  staff_notes text,                -- internal-only
  badges text[] default '{}',      -- 'lamai_recommended', 'staff_favorite'
  featured boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  property_id uuid references public.properties(id),
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT ON public.local_recommendations TO anon;              -- policy narrows to featured+active
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_recommendations TO authenticated;
GRANT ALL ON public.local_recommendations TO service_role;
ALTER TABLE public.local_recommendations ENABLE ROW LEVEL SECURITY;
-- policies: anon/guests read only featured+active; managers+admin full write; staff_notes hidden from guests via a view or SELECT column policy.
```

**Design tokens** shift `--primary`, `--primary-foreground`, `--accent`, and add `--trust` in `index.css`. No component-level color changes.

**Guest portal tabs** reuse existing shadcn `Tabs`. Existing hooks (`useGuestHistory`, `useStayEssentials`, `useArrival...`) stay wired to "Your Stay".

## 5. What stays untouched

Booking state machine, payments/deposits/refunds, RLS on existing tables, embed iframe API surface, i18n keys, MCP server, Vanta/Fenrir bridges, disaster recovery, notifications, and the existing brand memory around Terracotta/Gold on the landing page (only primary action colors shift to red/blue on operational surfaces).

## 6. Open question before I start

The existing brand memory records **Terracotta + Gold** as the "Camp Ready" accents; you're now asking for **red / blue / black / white**. I'll treat red/blue/black/white as the new source of truth and update the memory accordingly — unless you want the landing page's gold hero preserved as-is (recommended, since it's the "Built From Inside" brand moment). Confirm on approval and I'll start Stage 1.

&nbsp;

Approved for Stage 1.

&nbsp;

Treat red / blue / black / white as the new official LMT CampStay operational identity going forward, especially for booking flows, guest portal, staff/admin tools, embeds, CTAs, alerts, support/info states, and daily platform usage.

&nbsp;

Keep the existing gold/terracotta landing page hero if it already works visually, especially for the “Built From Inside” brand/storytelling moment. No need to destroy something that already has character unless it clashes badly.

&nbsp;

Main priority: expand what already exists without breaking the booking flow, payments, guest portal, admin tools, embeds, RLS, or integrations.

&nbsp;

Proceed with Stage 1 foundation:

&nbsp;

- Add listing_category and region to units

- Create local_recommendations with proper RLS

- Staff/admin write access only

- Public/guest read only for featured + active entries

- Keep staff_notes internal-only

- Update design tokens carefully

- Make sure no visible GroundStay branding returns

- Do not touch payment/deposit/refund logic

&nbsp;

After Stage 1, show what changed in plain English and flag anything risky before moving to Stage 2.