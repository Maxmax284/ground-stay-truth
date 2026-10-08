# THE ROCK — Grounded Audit and Design Proposal

## Executive verdict

**The concept fits CampStay, but it is not built yet.** The shipped product has the right visual vocabulary, a real guest Island Guide entry point, local recommendations, traveler intelligence, nine locale files, role controls, and installable-app plumbing. It does **not** yet have a canonical multilingual field manual, a public `/island-guide` page, reliable editorial/version governance, proven photo rights, or offline reading.

The safest direction is one dossier rendered in two places: a concise entry inside the authenticated Guest Portal and a public, booking-free `/island-guide`. Long-form articles, nearby places, and live advisories should remain distinct content types while sharing one editorial desk and one visible verification standard.

---

## A. What actually exists

### Guest experience

- `src/pages/GuestPortal.tsx:653-691` contains a horizontally scrollable Stay Board. Its **Island Guide** trigger is at `:682-685`; that label is currently hard-coded English.
- The Island Guide tab renders `GuestPlaybook` at `src/pages/GuestPortal.tsx:952-954`, not `IslandGuideCard`.
- `src/components/GuestPlaybook.tsx:37-67` reads active `playbook` rows from `intelligence_entries`, filters for guest audience, groups seven categories, and opens each article in a bottom sheet (`:170-239`). It currently uses hard-coded English category/location labels and raw article text.
- `IslandGuideCard` is a second, narrower surface. It reads published `local_recommendations`, renders nothing when empty (`src/components/guest/IslandGuideCard.tsx:55`), and is mounted for pre-arrival support at `GuestPortal.tsx:794-803`.
- `WhileYouWaitTab` is separate weather/sea/camp-basics content (`src/components/WhileYouWaitTab.tsx:52-220`). Its hard-coded fallback includes “Police checkpoints … are constant” (`:13-21`), which conflicts with this brief’s evidence standard.

### Current content and database reality

- `intelligence_entries` is the live source behind the Island Guide. The database currently contains **26 active rows**, all guest-audience; **3 are already expired** and hidden client-side. Only **2 of 26** have an approver recorded. Translation objects are empty.
- `src/hooks/useIntelligence.ts:11-31` supports status, audience, expiry, image/caption, `approved_by`, property scope, and a `translations` JSON object. `:62-69` hides expired rows in the client.
- `local_recommendations` is real and public-readable when `featured && is_active`; it supports categories, description, contact links, hours, photos, badges, internal notes, review stamps, closure/seasonality, and arrival-essential ranking (`src/hooks/useLocalRecommendations.ts:16-44`). **The live table currently has zero rows.**
- `src/components/admin/LocalRecommendationsEditor.tsx:101-229` provides manager/admin authoring, a separate “Mark checked” action, and an admin-only publish switch in the UI. However, the database UPDATE policy allows managers to update the whole row, including `featured`; the admin-only publish rule is therefore not server-enforced.
- `src/components/settings/GuestGuideSettings.tsx:13-40` already consolidates Getting Here, Camp & Room Essentials, and Island Guide editing under Settings.
- `media_library_assets` currently has **85 records**; **0 captions**, **0 alt texts**, and **18 tagged records**. It is useful infrastructure, not yet a provenance system.

### Languages

- `src/i18n/index.ts:7-17` advertises `en, th, fr, de, ru, zh, ja, ko, es`; non-English bundles lazy-load (`:41-58`), with English fallback.
- Language selection persists locally and to `profiles.preferred_language` (`src/hooks/useLanguagePreference.ts:17-75`). A deliberate device choice wins; no airport, passport, or nationality inference occurs.
- `GuestLanguagePicker` visibly distinguishes complete from partial languages (`src/components/guest/GuestLanguagePicker.tsx:27-29, 80-90`).
- Only `en, th, fr, de` are declared guest-ready (`src/i18n/guestSurface.ts:50`); coverage tests enforce guest-surface parity and placeholder safety for those four (`src/lib/__tests__/i18nCoverage.test.ts:93-126`). English and Thai are complete; French/German cover the declared guest surface but not the whole app. The other five remain explicitly partial.
- Existing translation covers guide chrome such as Directions and category names (`src/i18n/locales/en.json:2350-2372`, Thai parity at the same range), not article bodies, captions, search terms, or accessibility text.

### Visual system

- The shipped **Physical Camp OS** already supplies warm canvas, teak/dark surfaces, aged gold, terracotta/red, typed monospace metadata, stamps, ruled ledger lines, carbon-copy details, and reduced-motion fallbacks (`src/index.css:660-788, 815-957`).
- Strong reusable primitives: `station-header`, `board-kicker`, `attention-stamp`, `ink-stamp`, `camp-pass`, ledger rules, clipboard/board entrance, and the warm token system.
- The dossier should reuse these tokens but avoid boxing-ring ropes, radar sweeps, military-classified styling, faux-secret language, and visual wear that harms legibility.

### Routes, permissions, audit, AI

- `/guest` is protected (`src/App.tsx:140-142`). Public routes include `/stay`, payment, driver, legal, and unsubscribe (`:143-152`). **No `/island-guide` route exists.**
- Public recommendation RLS already allows anonymous reads only for featured active rows. `intelligence_entries` has no anonymous policy; guest reads require a confirmed/checked-in booking.
- `platform_guidance` has draft/approved/archived status and DB-enforced tone safety, but it is a staff-help registry with no editor UI—not the dossier source.
- `review_audit_log` is for guest reviews, not editorial content. `staff_audit_events` has 297 records but no dossier/local-guide edit events. Local recommendation and intelligence mutations do not write editorial history.
- `ai_action_drafts` is an operational approval queue, currently empty, and is not an editorial workflow. No AI path writes or publishes guide content. This correctly supports **AI eyes, not hands**, but editorial drafting would need its own human-reviewed lane.

### PWA/offline

- The manifest provides installability (`public/manifest.webmanifest`), but installability is not offline support.
- `public/sw.js:1-19` only imports push handling, installs, and deletes old caches on activation. It has no fetch handler, app-shell cache, article cache, or offline fallback.
- `src/main.tsx:22-46` avoids service workers in preview/iframes and checks for updates in published use.
- `OfflineBanner` says “showing cached data” (`src/components/OfflineBanner.tsx:20-24`), but dossier content is not persisted. A route alone would **not** provide downloaded/offline reading.

### Shipped vs previously discussed

- **Shipped:** authenticated Island Guide tab, `GuestPlaybook`, 26 intelligence articles, empty but functional local-recommendations editor/display path, language choice and fallback, Physical Camp OS tokens, installable manifest.
- **Discussed only:** “THE ROCK” title/copy, six departments, public `/island-guide`, multilingual full dossier, emergency quick-bar, dossier search/jump navigation, archival photo treatment, verified-source labels, native review/transcreation workflow, and actual offline copy.
- Earlier chat also generated unsupported claims. Those are historical brainstorm material, **not approved facts**.

### Manuscript retrieval audit — addendum

The final dossier is now explicitly scoped to contain the **complete approved guest-facing manuscript**, not outlines, summaries, or newly improvised replacement prose. The manuscript itself becomes a first-class editorial artifact: exact wording, paragraph order, headings, jokes, callouts, and concluding language must survive ingestion and review unless the owner approves a tracked revision.

#### Exact text retrievable from this project chat

- **Approved brief text:** the exact opening supplied in message 3041, from `LMT // FIELD INTELLIGENCE / ISLAND EDITION` through `leave the ego in the ring`; the final note is available only in the abbreviated form supplied there (`YOU'RE ON THE ROCK NOW ...`), not as a complete paragraph.
- **Six-department scope and flagship titles:** all six department names, required subjects, and flagship article titles from message 3041.
- **Exact clean jokes/callouts:** the Ducati/iced-coffee paragraph; the helmet/legal-advisor paragraph; the four named scooter “Don't Be That Guy” setups; and the Tuesday-sparring/championship-belt paragraph are quoted exactly in message 3041.
- **Earlier five-part draft:** message 3038 is fully retrievable. It contains short bullet prose for Samui neighborhoods and nearby islands; coconut/road/economy claims; attractions; culture; scooters, ocean, dogs, centipedes, mosquitoes, geckos, water/ice, taxis, and songthaews. This is recoverable wording, but it is **not approved for publication** because several claims are unsupported or overbroad.
- **Earlier East Coast sample copy:** message 3040 is fully retrievable. It contains sample paragraphs for scooters, taxis, jellyfish, temples, and island economics. These are voice samples, not the complete six-chapter manuscript, and several contain profanity or unsupported factual claims that conflict with the later brief.

#### Text not present in accessible project history

- The complete six-chapter prose in final approved order.
- Full neighborhood profiles for every named Samui area and surrounding island.
- The full expanded scooter/superbike article, helmet section, rental inspection section, insurance/license/permit section, taxi alternative, and ring-road challenge warning beyond the exact snippets in message 3041.
- Complete taxi/songthaew, water/ice, dogs/rabies, centipede/gecko, dengue/daytime-mosquito, ocean-flag, jellyfish-first-aid, scams, contacts, attractions, and Fight Camp Code articles.
- Every complete “Don't Be That Guy” entry with its practical takeaway.
- The complete final-note prose represented by the ellipsis in message 3041.
- Any wording that exists only in the separate ChatGPT brainstorming conversation.

These gaps must be filled by the separately supplied approved master manuscript. They must **not** be reconstructed from memory, inferred from section headings, or silently replaced with generic travel copy.

#### Section-by-section content inventory

| Section | Recoverable now | Missing before ingestion |
|---|---|---|
| Cover/opening | Exact opening from message 3041 | Any additional cover/deck copy from the external master |
| 01 Know the Rock | Short profiles for Lamai, Chaweng, Nathon/Lipa Noi, Bophut/Maenam; brief Phangan/Tao/Ang Thong notes from message 3038 | Full approved chapter, Maenam/Nathon/Lipa Noi distinctions, all final transitions/callouts |
| 02 How This Place Works | Short coconut/road/airport/family/migrant-labor draft from message 3038 | Full approved nuanced chapter and verified wording; every economic/historical claim requires sourcing |
| 03 Respect the Culture | Short jai yen, temple, monks, sacred images, Kru notes from message 3038 | Full approved prose, Wai Kru treatment, personal-space/head/feet detail, all final examples |
| 04 Street Survival | Short legacy hazard bullets from message 3038; East Coast samples from 3040; exact Ducati, helmet, and four mistake setups from 3041 | Full approved flagship and all complete subarticles/takeaways; medically/legal vetted instructions |
| 05 The Good Stuff | Brief attractions list from message 3038 | Full approved food, markets, beaches, ethical elephants, day trips, non-paid-placement language |
| 06 Fight Camp Code | One short Kru note from 3038 and exact sparring joke from 3041 | Full approved orientation, intensity, etiquette, heat/hydration, recovery, skin/gear hygiene, inclusion chapter |
| Final note | Opening and closing fragments from message 3041 | Exact complete final note from the approved master |

#### Preservation strategy

- Ingest the owner-supplied master as an immutable **source edition** with checksum, version, supplied date, and attribution; preserve a verbatim archival copy alongside structured display sections.
- Split content into structured blocks without rewriting: heading, prose, street reality, East Coast note, actual rule, Don't Be That Guy, takeaway, sources, photo/caption, and final encouragement.
- Track every editorial change as a diff against the approved source edition. No “cleanup,” shortening, tone smoothing, or fact correction silently changes the owner’s wording.
- Apply fact-review flags at claim/block level: `unreviewed`, `source_needed`, `verified`, `qualified_review_required`, `unverified_local_observation`, `evergreen_review_due`, or `live_expires_at`.
- A factual concern pauses that block from publication; it does not authorize AI or staff to rewrite it. The owner chooses whether to source, revise, qualify, or remove it.
- Each localized block points to the exact English source version. Humor is transcreated and separately approved; safety/legal/medical text uses precise same-meaning translation and qualified/native review. Source edits mark affected translations out of sync.
- Automated translation may produce a labeled draft only. It never overwrites the master, counts as native review, or inherits `verified` status automatically.
- Acceptance includes a manuscript completeness report proving every approved source block appears once, in order, with no silent omission or duplication.

---

## B. Gaps and conflicts

1. **Two overlapping content systems:** `GuestPlaybook`/`intelligence_entries` is live; `IslandGuideCard`/`local_recommendations` is empty. Replacing either blindly would lose useful distinctions.
2. **No canonical dossier model:** current article bodies cannot represent six departments, field reports, neutral rules, roasts, linked notes, sources, verification history, localized captions, or per-language review status cleanly.
3. **Approval is inconsistent:** most intelligence rows lack approver attribution; recommendations have a client-only admin publish restriction; neither has immutable version history.
4. **Translation is UI-deep, not content-deep:** article text and database-entered recommendations remain whichever language staff typed.
5. **Public access does not exist:** the current Island Guide requires a guest session and qualifying booking.
6. **Offline is not real:** no service worker caching or downloaded guide snapshot exists.
7. **Photo governance is absent:** the library lacks license, creator, consent, location, capture date, source, expiry, representation review, and usage approval fields; current alt/caption completeness is 0/85.
8. **Guest portal density:** the guide is one tab among many. The dossier must be easy to find without outranking arrival, payment, pickup, room, documents, or messaging.
9. **Existing factual debt:** expired intelligence rows and unsourced legacy claims must not be carried into THE ROCK.

---

## C. Screen-by-screen look

### 1. Guest Portal entry

A compact **THE ROCK** folder tab inside the existing Island Guide position—not a new dashboard and not above urgent stay actions.

```text
THE ROCK // ISLAND FIELD MANUAL
Street-smart Samui knowledge from the Lamai team
[Open field manual]   [Live advisory: only when verified]
```

It shows the current language and a quiet “public guide” link. Arrival/payment/pickup actions remain above it.

### 2. Public `/island-guide` cover

- Full-width warm canvas, restrained teak header, aged-gold folio number.
- Exact approved opening copy, with `LMT // FIELD INTELLIGENCE / ISLAND EDITION` as a stamped kicker.
- Authentic Samui or LMT image slot with visible caption/credit—not decorative stock.
- Top language selector, search, and six numbered jump tabs.
- No account, booking data, Kru Glitch dock, staff controls, or guest operational cards.

### 3. Department index

Six numbered ruled-paper rows with one-line descriptions and article counts. On phones: sticky compact department selector plus search; no horizontal dependence. On desktop: left folio rail and readable article column.

### 4. Field report

```text
FIELD REPORT 04.01                         SAFETY NOTICE
SCOOTERS, SUPERBIKES & THE RING ROAD
[approved image — location, date, creator, caption]

STREET REALITY
Warm, plain-language context.

EAST COAST NOTE
Humor, never inside the critical instruction.

THE ACTUAL RULE
Neutral, precise, localized instruction.

DON'T BE THAT GUY [expand]
Mistake → practical takeaway.

Sources · Related field notes · LAST VERIFIED [only when valid]
```

Safety notices use calmer red structure, not alarmist animation. LIVE ADVISORY appears only with source, verifier, timestamp, and expiry. Related attractions use linked `local_recommendations` cards rather than duplicating place data in prose.

### 5. Search and mobile navigation

- Search indexes translated titles, bodies, tags, locations, and aliases for the selected locale.
- Results preserve department context and classification.
- Accordions are optional for secondary sections; headings and emergency content stay directly reachable.
- Focus moves to the article heading after navigation; skip link, semantic landmarks, 44px targets, visible focus, long-word wrapping, and screen-reader labels are mandatory.

### 6. Motion

Use 220–380ms damped folder-slide, stamp-settle, and photo-reveal transitions once per navigation. No continuous flipping, radar sweep, parallax, or distressed jitter. `prefers-reduced-motion` renders immediate state changes with no lost information.

### 7. Staff editorial desk

One desk with department/article list, locale/version matrix, source panel, photo-rights panel, preview, review notes, and publish controls. Nearby places and live advisories remain clearly labeled linked records. Draft/needs review/approved/published/expired are visible states, not inferred from toggles.

---

## D. Proposed source-of-truth architecture — design only

### Canonical separation

1. **Master manuscript editions:** immutable verbatim owner-supplied manuscripts with checksum, attribution, supplied date, version, and supersession history. This is the authoritative wording archive.
2. **Field reports:** structured renderings of the master with stable slug, department, classification, source-edition/block references, ordered sections, related article/place IDs, publication status, and version. Structure must not silently alter prose.
3. **Localized versions:** one version per locale, tied to exact source blocks, with status `missing → draft → native_review → approved`; translated humor is marked **transcreation**, safety text **same-meaning precision**.
4. **Sources and verification:** claim-level or block-level source records with URL/document, authority type, jurisdiction, checked date, verifier, notes, and next-review/expiry.
5. **Places:** retain `local_recommendations` for businesses, attractions, beaches, and practical contacts; link them into articles rather than duplicating them.
6. **Live advisories:** use expiring, source-backed advisory records; do not bury realtime notices inside evergreen article copy.
7. **Media:** approved assets reference provenance, rights/consent, location, creator, capture date, caption, alt text, permitted uses, and review status.
8. **Audit:** append-only editorial events for manuscript ingestion, block mapping, draft, edit, source change, translation sync, review, publish, unpublish, expiry, and emergency correction.

### Authority model

- Manager/editor may draft and propose.
- Native reviewer approves a locale, not the source article.
- Admin publishes/unpublishes and approves LIVE classification.
- Server rules—not disabled switches—enforce authority.
- AI may suggest outlines, translations, stale flags, or source questions into a draft; it cannot approve, publish, classify as LIVE, or overwrite human copy.
- A source edit marks every affected translation out-of-sync until reviewed; fallback is clearly labeled English, never disguised as reviewed translation.

---

## E. Photo sourcing, rights, and accuracy plan

### Shot list

- Lamai street/beach context; Chaweng, Bophut/Fisherman’s Village, Maenam, Nathon, Lipa Noi.
- Nathon/Lipa Noi ferry context; Ang Thong, Koh Phangan, Koh Tao only from authentic visits/licensed local creators.
- Ring road conditions, wet surfaces, gravel, helmet fit, rental inspection details—staged safely, never encouraging risky riding.
- Wat Khunaram, Hin Ta/Hin Yai, Secret Buddha Garden, Big Buddha, Wat Plai Laem with site-respect rules.
- Markets, independent food, beaches, ethical animal experiences.
- LMT training, Kru respect, hydration, gear hygiene, recovery, and community—with explicit participant consent.
- Safety-support visuals only where they clarify: warning flags, vinegar stations, mosquito prevention, approved emergency facilities.

### Acceptance record per image

Owner/licensor; written permission or license; allowed channels/duration; recognizable-person consent; exact location/date; creator credit; factual caption; translated caption; alt text; representation/cultural review; crop variants; expiry/review date. Reject scraped social images, generic “Thailand” stock, misleading landmarks, exploitative migrant/community imagery, unsafe staged behavior, or unclear rights.

Optimize approved masters to responsive AVIF/WebP/JPEG derivatives; preserve a non-image text experience for low bandwidth.

---

## F. Fact and localization checklist

### Never publish without evidence

- “95% of hospital visits/camp hospital runs are scooter related.”
- “Five or six families own/control the island.”
- Fixed `฿50–100` songthaew fare as current universal truth.
- “Samui taxis universally never use meters.”
- A fixed July–October box-jellyfish peak stated as settled local medical fact.
- “All geckos are harmless.”
- Hollow/tube ice is guaranteed safe.
- Daily/constant police checkpoints or a specific October 2026 helmet crackdown without official confirmation.
- Any precise percentage, price, fine, timetable, emergency number, airport ownership/economic claim, road-history date, ferry/flight policy, insurance/legal-license rule, or medical treatment without a current authoritative source.

The October 2026 helmet-enforcement item may appear only as **unverified local observation**, clearly dated and never promoted to LIVE without official confirmation.

### Review order

1. Thai legal/transport authorities for license, permit, helmet, enforcement, and passport-collateral guidance.
2. Thai/public-health or qualified medical sources for jellyfish first aid, rabies, dengue, bites, wounds, hydration, infection, and emergency contacts.
3. Official airport/ferry/operator/company records for ownership, schedules, terminals, and economics.
4. Reputable historical sources for coconut/fishing/road/development history.
5. Nikki/Nam/local contributors for practical context—attributed only with approval and never used as sole authority for law or medicine.
6. Native-language review: Thai first for cultural/legal nuance; then French/German; remaining languages stay visibly partial until reviewed.
7. Verify every number and external link immediately before publication; assign evergreen review intervals and hard expiry to LIVE advisories.

---

## G. Minimal phased implementation plan

### Phase 0 — editorial lock and cleanup

Receive the complete approved master manuscript from the separate ChatGPT conversation; checksum and inventory it against the section-by-section checklist above. Freeze unverified legacy guide claims from dossier reuse; inventory the 26 intelligence rows; identify the 3 expired advisories; decide which content is retained, rewritten, sourced, or archived. **No dossier implementation begins until manuscript completeness is confirmed.** Correct the misleading offline banner independently only if separately approved.

### Phase 1 — canonical English prototype, no public publication

Ingest the complete English master verbatim, map every block into the six-department article pattern, and produce an omission/duplication/diff report. Build the source/verification model, rights metadata, editorial audit, and server-enforced roles. Flag unsupported claims without silently rewriting them. Use image placeholders with shot requirements—not fetched images.

### Phase 2 — visual prototype and usability review

Render the portal entry and public-route prototype behind staff review. Test 320/375/430px phones, desktop, keyboard, screen reader, contrast, long strings, low bandwidth, missing images, reduced motion, and safety-content discoverability.

### Phase 3 — translation governance

Add the top switch and locale/version matrix. Native-review English→Thai first, then French/German. Offer other five as partial only when the dossier can visibly explain fallback. Require transcreation review for humor and same-meaning sign-off for safety.

### Phase 4 — verified photos and curated places

Commission/collect the shot list; record rights/consent; caption and translate. Populate linked local recommendations only after human review. No paid-placement implication.

### Phase 5 — public release

Publish one booking-free `/island-guide` and connect the existing portal tab to the same source. Add route-specific metadata. Preserve guest operational priority and property isolation.

### Phase 6 — offline, only if explicitly approved

Implement genuine published-app offline support using the project’s guarded PWA path, with NetworkFirst navigation, explicit guide-version/update messaging, and no service-worker registration in preview/dev. Offline must be tested after publication; until then, call it “bookmarkable,” not offline.

### Risks and tradeoffs

- Rich editorial workflow costs more than hard-coded locale JSON, but prevents stale safety advice and translation drift.
- Public access increases utility but requires strict separation from bookings, guest identity, staff notes, and property-private content.
- Humor improves voice but increases localization risk; critical rules must remain neutral.
- Offline safety material can become dangerously stale; LIVE advisories should expire and should not be presented as current offline.
- The current intelligence library may look reusable, but importing it wholesale would preserve unsupported claims and weak approval attribution.

### Decisions needed

1. **Nikki:** approve the six departments, practical Lamai priorities, local attributions, and which real places merit inclusion.
2. **Nam:** review fight-camp code, trainer etiquette, heat/recovery, and daily operational accuracy.
3. **Maxwell/admin:** confirm public `/island-guide` plus portal entry as the intended two views of one source; appoint final publisher and emergency correction authority.
4. Name qualified reviewers for Thai culture/legal nuance and medical safety.
5. Confirm language order: recommended `en → th → fr/de`, then the remaining five only after native review capacity exists.
6. Confirm whether offline reading is worth the stale-content and testing burden; recommended default is **not in the first release**.
7. Confirm photo ownership: camp-commissioned library first, licensed local contributors second, no scraped imagery.
8. Supply the complete approved master manuscript from the separate ChatGPT conversation, including the unabridged final note and every Don't Be That Guy entry; this is a hard dependency before implementation.

---

## H. No-code-change attestation

This was a read-only audit and proposal. **No application source, database schema, database rows, migrations, functions, routes, locale content, service worker, images, storage, publishing configuration, preview, or deployment was changed.** No content was seeded or uploaded. The only written artifact is this review plan for approval; implementation remains blocked until explicitly authorized in a subsequent turn.
