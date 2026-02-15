

# Complete Remaining Gaps: Staff Dashboard Panels, Sidebar Badges, i18n Hardcoded Strings, and Translation Files

Everything from the RLS fixes, notification expansion, and message read tracking is done. What's left are items from the previous dark mode/i18n/role-visibility plan that didn't get finished due to interruptions.

---

## 1. Show MaintenanceQueue and LaundryPanel for All Staff on Dashboard

Right now, only the `maintenance` role sees these panels on the dashboard. Front Desk, Supervisors, Managers, and Admins should also see them since they receive notifications about these requests and need visibility.

### File: `src/pages/Index.tsx`

After the Quick Actions card (around line 119), add a section that renders `<MaintenanceQueue />` and `<LaundryPanel />` for any non-viewer, non-maintenance staff role. (Maintenance already has its own dedicated dashboard with these panels.)

---

## 2. Expand Sidebar Maintenance Badge to All Staff

Currently the maintenance count badge on the Dashboard nav item only shows when `role === "maintenance"`. It should show for front_desk, supervisor, manager, and admin too.

### File: `src/components/AppSidebar.tsx`

Change the condition on line 138 from `isMaintenance` to a broader check that includes all staff roles that can view maintenance requests.

---

## 3. Replace Hardcoded Strings with i18n Keys

Four places still have hardcoded English text instead of translation calls:

| File | Text | Replacement |
|------|------|-------------|
| `src/components/AppSidebar.tsx` line 105 | `"Ground Stay"` | `t("auth.groundStay")` |
| `src/components/DashboardLayout.tsx` line 39 | `"Menu"` | `t("common.menu")` |
| `src/components/DashboardLayout.tsx` line 41 | `"Ground Stay"` | `t("auth.groundStay")` |
| `src/components/GuestLayout.tsx` line 27 | `"Ground Stay"` | `t("auth.groundStay")` |

New keys to add to `en.json`:
- `"common.menu": "Menu"` (if not already there)
- `"auth.groundStay": "Ground Stay"` (if not already there)

---

## 4. Create All Missing Translation Files

The locale directory currently only contains `en.json`. All 7 other language files need to be created (skipping Korean per your request):

| File | Language |
|------|----------|
| `src/i18n/locales/th.json` | Thai |
| `src/i18n/locales/fr.json` | French |
| `src/i18n/locales/de.json` | German |
| `src/i18n/locales/ru.json` | Russian |
| `src/i18n/locales/zh.json` | Chinese (Simplified) |
| `src/i18n/locales/ja.json` | Japanese |
| `src/i18n/locales/es.json` | Spanish |

Each file will mirror the full `en.json` structure with properly translated values. The language selector and lazy-loading system are already in place -- these files just need to exist.

---

## Summary

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Add MaintenanceQueue + LaundryPanel for all staff roles |
| `src/components/AppSidebar.tsx` | Expand badge to all staff + replace "Ground Stay" with `t()` |
| `src/components/DashboardLayout.tsx` | Replace "Menu" and "Ground Stay" with `t()` |
| `src/components/GuestLayout.tsx` | Replace "Ground Stay" with `t()` |
| `src/i18n/locales/en.json` | Add `common.menu` and `auth.groundStay` keys if missing |
| `src/i18n/locales/th.json` | NEW -- full Thai translation |
| `src/i18n/locales/fr.json` | NEW -- full French translation |
| `src/i18n/locales/de.json` | NEW -- full German translation |
| `src/i18n/locales/ru.json` | NEW -- full Russian translation |
| `src/i18n/locales/zh.json` | NEW -- full Chinese translation |
| `src/i18n/locales/ja.json` | NEW -- full Japanese translation |
| `src/i18n/locales/es.json` | NEW -- full Spanish translation |

No database changes needed. No new dependencies needed.
