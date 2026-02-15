

# Full Multi-Language Support: Translation Files + Hardcoded String Cleanup

## The Problem

Right now, only `en.json` exists in `src/i18n/locales/`. When you switch to Thai, French, or any other language, the system falls back to English for every single string because there are no translation files for those languages. On top of that, several strings are hardcoded directly in components and never go through the translation system at all.

---

## Part 1: Create All 8 Missing Locale Files

Create complete translation files for all 8 non-English languages:

| File | Language |
|------|----------|
| `src/i18n/locales/th.json` | Thai |
| `src/i18n/locales/fr.json` | French |
| `src/i18n/locales/de.json` | German |
| `src/i18n/locales/ru.json` | Russian |
| `src/i18n/locales/zh.json` | Chinese (Simplified) |
| `src/i18n/locales/ja.json` | Japanese |
| `src/i18n/locales/ko.json` | Korean |
| `src/i18n/locales/es.json` | Spanish |

Each file mirrors the exact structure of `en.json` (all 730+ lines) with every value properly translated. The keys stay in English -- only the values change.

---

## Part 2: Fix Hardcoded Strings

Several strings bypass the translation system entirely. These need to be moved into `en.json` (and all locale files) and replaced with `t()` calls:

| Location | Hardcoded String | Fix |
|----------|-----------------|-----|
| `src/pages/Auth.tsx` line 55 | `"Train. Stay. Compete."` | Add `auth.tagline` key |
| `src/pages/GuestAuth.tsx` line 68 | `"Fighter's Quarters"` | Add `guestAuth.tagline` key |
| `src/components/DashboardLayout.tsx` line 39 | `"Menu"` | Add `common.menu` key |
| `src/components/DashboardLayout.tsx` line 41 | `"Ground Stay"` | Use existing `auth.groundStay` key |
| `src/components/GuestLayout.tsx` line 27 | `"Ground Stay"` | Use existing `auth.groundStay` key |
| `src/components/AppSidebar.tsx` line 105 | `"Ground Stay"` | Use existing `auth.groundStay` key |

---

## Part 3: Language Selector Visibility

The language selector is already present on:
- Auth pages (top-right corner) -- visible to everyone
- Sidebar footer (staff dashboard) -- visible to staff
- Guest layout header -- visible to guests

This covers all user types. No changes needed here -- the selector is already accessible everywhere.

---

## Technical Details

### New Keys Added to `en.json`
```json
"auth.tagline": "Train. Stay. Compete.",
"guestAuth.tagline": "Fighter's Quarters",
"common.menu": "Menu"
```

### Files Created (8 new)
| File | Content |
|------|---------|
| `src/i18n/locales/th.json` | Full Thai translation |
| `src/i18n/locales/fr.json` | Full French translation |
| `src/i18n/locales/de.json` | Full German translation |
| `src/i18n/locales/ru.json` | Full Russian translation |
| `src/i18n/locales/zh.json` | Full Chinese translation |
| `src/i18n/locales/ja.json` | Full Japanese translation |
| `src/i18n/locales/ko.json` | Full Korean translation |
| `src/i18n/locales/es.json` | Full Spanish translation |

### Files Modified (5)
| File | Change |
|------|--------|
| `src/i18n/locales/en.json` | Add 3 new keys (tagline, menu) |
| `src/pages/Auth.tsx` | Replace hardcoded tagline with `t("auth.tagline")` |
| `src/pages/GuestAuth.tsx` | Replace hardcoded tagline with `t("guestAuth.tagline")` |
| `src/components/DashboardLayout.tsx` | Replace hardcoded "Menu" and "Ground Stay" with `t()` calls |
| `src/components/GuestLayout.tsx` | Replace hardcoded "Ground Stay" with `t("auth.groundStay")` |
| `src/components/AppSidebar.tsx` | Replace hardcoded "Ground Stay" with `t("auth.groundStay")` |

### No new dependencies needed

The lazy-loading system in `src/i18n/index.ts` already handles dynamic imports of locale files -- no changes needed there.

