

# Full Internationalization (i18n) for Ground Stay

## Overview

Add multi-language support across the entire platform -- staff dashboard, guest portal, login page, and embeddable widgets. Every hardcoded English string will be replaced with translation keys. Users can switch languages from a persistent dropdown, and their preference is saved.

**Supported languages (9):** English (default), Thai, French, German, Russian, Chinese (Simplified), Japanese, Korean, Spanish

## Architecture

The system uses `react-i18next` with `i18next`, the standard React internationalization library. Translation files are bundled as JSON (not loaded over HTTP) since the language set is fixed and the strings are finite.

**Language selector placement:**
- Staff dashboard: In the sidebar footer, above "Sign out"
- Guest portal: In the guest header bar
- Auth/login page: Top-right corner
- Embed widgets: Via a `lang` query parameter (e.g., `?lang=th`) -- no UI selector since embeds are controlled by the embedding site

**Persistence:** Language preference stored in `localStorage` and optionally in the user's profile (so it follows them across devices).

## Implementation Plan

### Phase 1: i18n Foundation

**New dependencies:** `i18next`, `react-i18next`

**New files:**
- `src/i18n/index.ts` -- i18n initialization, language list, fallback config
- `src/i18n/locales/en.json` -- English translations (the master file, ~400 keys)
- `src/i18n/locales/th.json` -- Thai
- `src/i18n/locales/fr.json` -- French
- `src/i18n/locales/de.json` -- German
- `src/i18n/locales/ru.json` -- Russian
- `src/i18n/locales/zh.json` -- Chinese (Simplified)
- `src/i18n/locales/ja.json` -- Japanese
- `src/i18n/locales/ko.json` -- Korean
- `src/i18n/locales/es.json` -- Spanish
- `src/components/LanguageSelector.tsx` -- Reusable dropdown component

**Key config in `src/i18n/index.ts`:**
- `fallbackLng: "en"`
- `interpolation.escapeValue: false` (React handles XSS)
- Resources bundled inline (no HTTP backend needed)
- Reads from `localStorage` on init

**Import in `src/main.tsx`:** Add `import "@/i18n"` before the app renders.

### Phase 2: Extract All Hardcoded Strings

Every file with user-facing text needs its strings replaced with `t("key")` calls. The translation keys will be organized by namespace/section:

**Key structure (flat with dot notation in a single namespace):**

```text
common.signOut
common.loading
common.save
common.cancel
common.edit
common.remove
common.search
common.today
common.guest / common.guests

nav.dashboard
nav.units
nav.bookings
nav.calendar
nav.pricing
nav.reports
nav.messages
nav.settings

auth.signIn
auth.signUp
auth.email
auth.password
auth.fullName
auth.welcomeBack
auth.createAccount
auth.checkEmail
auth.noAccount
auth.haveAccount

dashboard.welcome
dashboard.todaysArrivals
dashboard.todaysDepartures
dashboard.activeBookings
dashboard.activeUnits
dashboard.quickActions
dashboard.recentActivity
dashboard.newBooking
dashboard.viewCalendar
dashboard.manageUnits
dashboard.pricingPolicies

bookings.title
bookings.manageReservations
bookings.newBooking
bookings.noBookings
bookings.unit
bookings.guest
bookings.checkIn
bookings.checkOut
bookings.guests
bookings.state
bookings.created

states.inquiry
states.soft_hold
states.pending_approval
states.pending_deposit
states.confirmed
states.checked_in
states.completed
states.cancelled
states.no_show

... (and so on for units, calendar, pricing, settings, guest portal, messages, embeds)
```

**Files requiring changes (all user-facing components):**

| File | Approximate string count |
|------|--------------------------|
| `src/pages/Auth.tsx` | ~15 |
| `src/pages/Index.tsx` | ~25 |
| `src/pages/Bookings.tsx` | ~20 |
| `src/pages/CalendarView.tsx` | ~15 |
| `src/pages/Units.tsx` | ~25 |
| `src/pages/Pricing.tsx` | ~30 |
| `src/pages/Reports.tsx` | ~20 |
| `src/pages/Settings.tsx` | ~10 |
| `src/pages/Messages.tsx` | ~15 |
| `src/pages/GuestPortal.tsx` | ~40 |
| `src/pages/EmbedWidget.tsx` | ~20 |
| `src/pages/NotFound.tsx` | ~3 |
| `src/components/AppSidebar.tsx` | ~15 |
| `src/components/DashboardLayout.tsx` | ~10 |
| `src/components/GuestLayout.tsx` | ~5 |
| `src/components/BookingDetailSheet.tsx` | ~40 |
| `src/components/BookingStateTransition.tsx` | ~20 |
| `src/components/BookingFormDialog.tsx` | ~25 |
| `src/components/BookingFilters.tsx` | ~10 |
| `src/components/ProfileEditor.tsx` | ~10 |
| `src/components/PolicySettingsForm.tsx` | ~10 |
| `src/components/UserRoleManager.tsx` | ~15 |
| `src/components/CreateStaffAccountForm.tsx` | ~10 |
| `src/components/EmbedCodeGenerator.tsx` | ~15 |
| `src/components/UnitFormDialog.tsx` | ~15 |
| `src/components/UnitGroupManager.tsx` | ~10 |
| `src/components/UnitPhotoUpload.tsx` | ~5 |
| `src/components/GuestDocumentUpload.tsx` | ~10 |
| `src/components/MaintenanceBlockDialog.tsx` | ~10 |
| `src/components/EarlyCheckinApproval.tsx` | ~10 |
| `src/components/CalendarLegend.tsx` | ~5 |
| `src/components/ProtectedRoute.tsx` | ~5 |
| `src/lib/bookingStateMachine.ts` | ~10 (STATE_LABELS) |
| `src/lib/refundCalculator.ts` | ~5 |

**Total: ~550+ strings across ~35 files**

### Phase 3: State Labels and System Constants

`STATE_LABELS` in `bookingStateMachine.ts` are currently hardcoded English strings used everywhere. These need to become translation keys:

```typescript
// Before
export const STATE_LABELS: Record<BookingState, string> = {
  inquiry: "Inquiry",
  ...
};

// After -- create a helper function
export function getStateLabel(state: BookingState, t: TFunction): string {
  return t(`states.${state}`);
}
```

Similar treatment for:
- `ROLE_LABELS` in `AppSidebar.tsx`
- `POLICY_LABELS` in `PolicySettingsForm.tsx`
- `SOURCE_LABELS` in `BookingFormDialog.tsx`
- Payment method labels
- Refund tier labels

### Phase 4: Language Selector Component

A compact dropdown showing language flag emoji + name:
- English, ภาษาไทย, Francais, Deutsch, Русский, 中文, 日本語, 한국어, Espanol
- Calls `i18n.changeLanguage(code)` and saves to `localStorage`
- Placed in sidebar footer, guest header, and auth page

### Phase 5: Embed Widget i18n

Embed widgets don't use React context (they're standalone with inline styles). They will:
- Read a `lang` query parameter from the URL
- Import translations directly (no provider needed)
- The embed code generator will add a language dropdown to the generated snippet options

### Phase 6: Non-English Translations

The initial deploy will include English as the complete master file. The other 8 language files will be generated using an AI translation pass to produce accurate translations for all keys. These are UI labels (short, contextual), not prose, so translation quality is high.

## Technical Notes

- `date-fns` locale support: Import locale objects for date formatting (`th`, `fr`, `de`, `ru`, `zhCN`, `ja`, `ko`, `es`) and pass to `format()` calls
- Pluralization: i18next handles plural forms natively (e.g., `"1 guest"` vs `"2 guests"`) using `_one` / `_other` key suffixes
- RTL: None of the 9 languages require RTL layout
- Currency: Dollar amounts remain as-is (not locale-formatted) since the business operates in a single currency

## Execution Strategy

Due to the scope (~35 files, ~550 strings), this will be implemented in batches:
1. Foundation + language selector + Auth page + sidebar/layout (proof of concept)
2. Dashboard + Bookings + Calendar pages
3. Units + Pricing + Reports + Settings pages
4. Guest Portal + Messages
5. Embed widgets
6. All 8 non-English translation files

