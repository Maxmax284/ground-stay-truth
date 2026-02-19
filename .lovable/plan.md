
# Phase 7-8: Guest Portal and Internationalization Audit

## Phase 7: Guest Portal -- Test Results

### What was verified (code audit)

| # | Test | Result |
|---|------|--------|
| 7.1 | Listing cards display unit photos, amenities, pricing | PASS -- uses `formatPrice()` with dynamic currency from `policy_settings` |
| 7.2 | Booking form collects guest_type (fighter/training_guest/spectator/long_term) | PASS -- Select dropdown with all 4 types, fully i18n'd in English and Thai |
| 7.3 | Booking form collects arrival details (flight, arrival time, emergency contact, dietary) | PASS -- All 4 fields present with labels and placeholders |
| 7.4 | Camp Info tab shows configured camp_info from policy_settings | PASS -- Reads `camp_info` key from policies, shows fallback if not configured |
| 7.5 | Policies tab shows check-in time and check-out time | PASS -- Reads `earliest_checkin_time` and `checkout_time` from policy_settings |
| 7.6 | Messages tab with realtime, inline translation | PASS -- Realtime subscription on `messages` table, thread view with send/reply |
| 7.7 | Stay Support tab appears only during checked_in state | PASS -- Conditional render: `{activeBookings.length > 0 && <TabsTrigger>}` |
| 7.8 | Cancellation dialog shows refund preview with correct tier | PASS -- Uses `calculateRefund()` with 3-tier display (free/partial/none) |
| 7.9 | Document upload works for ID verification | PASS -- `GuestDocumentUpload` component renders for confirmed/pending states |
| 7.10 | Profile editor saves WhatsApp and LINE ID | PASS -- `ProfileEditor` component includes WhatsApp and LINE fields |

### Guest Portal verdict: All 10 tests PASS

---

## Phase 8: Internationalization -- Test Results

### File size comparison (key count indicator)

| Language | File | Lines | Status |
|----------|------|-------|--------|
| English (en) | Full reference | 835 | Complete -- 835 keys |
| Thai (th) | Full | 812 | Complete -- all sections present |
| Korean (ko) | Full | 812 | Complete -- all sections present |
| French (fr) | Full | 812 | Near-complete -- missing guest booking detail keys |
| German (de) | Full | 757 | Missing guest booking detail keys and some deposit keys |
| Russian (ru) | Compact | 92 | INCOMPLETE -- missing most sections |
| Chinese (zh) | Compact | 44 | INCOMPLETE -- missing most sections |
| Japanese (ja) | Compact | 44 | INCOMPLETE -- missing most sections |
| Spanish (es) | Compact | 44 | INCOMPLETE -- missing most sections |

### Critical missing translation keys

The following keys exist in English but are missing from multiple language files. When these keys are missing, i18next falls back to English, so users see a mix of their language and English strings.

**Missing from German (de.json) and French (fr.json):**
- `guestBooking.guestType` -- "Guest Type" label in booking form
- `guestBooking.guestTypes.fighter` -- "Fighter"
- `guestBooking.guestTypes.training_guest` -- "Training Guest"
- `guestBooking.guestTypes.spectator` -- "Spectator"
- `guestBooking.guestTypes.long_term` -- "Long-term Stay"
- `guestBooking.arrivalDetails` -- "Arrival Details" section header
- `guestBooking.flightInfo` -- "Flight / Ferry" label
- `guestBooking.flightPlaceholder` -- placeholder text
- `guestBooking.arrivalTime` -- "Expected Arrival" label
- `guestBooking.emergencyContact` -- "Emergency Contact" label
- `guestBooking.emergencyPlaceholder` -- placeholder text
- `guestBooking.dietaryRestrictions` -- "Dietary Restrictions" label
- `guestBooking.dietaryPlaceholder` -- placeholder text
- `guestPortal.campInfo` -- "Camp Info" tab label
- `guestPortal.noCampInfo` -- fallback text when no camp info configured
- `ai.modes.camp` -- "Camp" mode label for Kru

**Missing from Russian, Chinese, Japanese, Spanish:**
- All of the above, PLUS large sections including: `deposit.*`, `override.*`, `preview.*`, `staySupport.*` (partial), `earlyCheckin.*`, `embed.*`, and `guestPortal.*` subsections

### Hardcoded currency bug in translations

Found `$` hardcoded in translation strings across ALL language files:
- `refund.ofTotal`: `"of ${{total}} total"` -- should use dynamic currency symbol
- `deposit.requiredAmount`: `"Required deposit: ${{amount}}"` -- same issue
- `deposit.guestAmount`: `"Deposit amount: ${{amount}}"` -- same issue

Since the actual rendering in `GuestPortal.tsx` line 612 passes `formatPrice()` output into the template variable, the `$` in `refund.ofTotal` is actually double-displaying (formatPrice adds the symbol, then the string adds another `$`). This needs to be fixed by removing the `$` from the translation strings and letting `formatPrice()` handle it.

---

## What needs to be fixed

### Fix 1: Add missing translation keys to German and French
Add the `guestBooking` arrival detail keys, `guestPortal.campInfo`, `guestPortal.noCampInfo`, and `ai.modes.camp` to both `de.json` and `fr.json`.

### Fix 2: Expand Russian, Chinese, Japanese, and Spanish translation files  
These 4 files are severely incomplete (44-92 lines vs 812 in English). They need the full set of keys for: `guestPortal`, `guestBooking`, `deposit`, `override`, `preview`, `staySupport`, `earlyCheckin`, `embed`, `legal`, `notifications`, `ai`, and `translation` sections.

### Fix 3: Remove hardcoded `$` from refund and deposit translation strings
In all 9 language files, update:
- `refund.ofTotal` -- remove `$` prefix from the `{{total}}` variable (the caller already uses `formatPrice()`)
- `deposit.requiredAmount` -- remove `$` prefix from `{{amount}}`  
- `deposit.guestAmount` -- remove `$` prefix from `{{amount}}`

---

## Technical approach

1. Update `de.json` and `fr.json` with the missing ~16 keys each (German and French translations)
2. Expand `ru.json`, `zh.json`, `ja.json`, and `es.json` from their current compact format to include all missing sections (~700+ keys each)
3. Fix the `$` hardcoding in `refund.ofTotal`, `deposit.requiredAmount`, and `deposit.guestAmount` across all 9 locale files
4. No code changes needed in components -- all components already use `t()` correctly; the issue is purely missing translation values

This is a translation data fix, not a logic fix. The fallback behavior (showing English) means nothing is broken, but international guests see mixed-language UIs which is unprofessional for a production platform.
