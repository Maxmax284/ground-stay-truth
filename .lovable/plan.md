

# Notification Gaps Fix + Complete i18n Translation Files

This plan has two parts: (1) fix the missing notifications so admins/staff always know when requests come in and guests get feedback, and (2) finish creating all 8 translation files that were interrupted earlier.

---

## Part 1: Fix Notification Gaps

### What's missing today

| Event | Who gets notified now | Who should get notified |
|-------|----------------------|------------------------|
| Guest submits laundry request | Nobody | Admin, Manager, Front Desk |
| Maintenance status changes to "in_progress" | Nobody | Guest who submitted it |
| Maintenance status changes to "resolved" | Nobody | Guest who submitted it |
| Laundry status changes to "in_progress" | Nobody | Guest who submitted it |
| Laundry "ready for pickup" | Guest (already works) | Guest (no change needed) |

### What's already working

- New maintenance request notifies admin, manager, and maintenance staff
- Laundry "ready for pickup" notifies the guest
- All actions are logged in `stay_support_log`
- Realtime subscription refreshes the bell icon on INSERT

### Changes

**File: `src/hooks/useLaundryRequests.ts`**

In `useCreateLaundryRequest` -- after inserting the request, query `user_roles` for admin/manager/front_desk users and call `createNotification` for each (same pattern already used in `useCreateMaintenanceRequest`). Include unit name in the message.

In `useAdvanceLaundryStatus` -- when status advances to `in_progress`, look up the guest via the booking and send them a notification ("Your laundry is being processed"). The existing `ready_for_pickup` notification stays as-is.

**File: `src/hooks/useMaintenanceRequests.ts`**

In `useUpdateMaintenanceStatus` -- after updating status, look up `booking.guest_id` and send a notification to the guest:
- `in_progress`: "Your maintenance request is being worked on"
- `resolved`: "Your maintenance request has been resolved"

### Notification message i18n note

The notification messages stored in the database are currently hardcoded English strings (e.g., "Your laundry is ready for pickup!"). These are stored as plain text in the `notifications` table and displayed as-is in the bell dropdown. Making these fully translatable would require either storing i18n keys instead of text (breaking change) or translating at display time. For now, the messages will remain in English in the database since they need to be readable by both staff and guests who may use different languages. This can be addressed in a future enhancement.

---

## Part 2: Complete i18n Translation Files

The previous session was interrupted before any locale files were created. All 8 files need to be built from scratch, each mirroring the full 734-line structure of `en.json` with properly translated values.

### Files to create

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

Each file has the same JSON keys as `en.json` with all values translated. Template variables like `{{count}}`, `{{hours}}`, `{{days}}` are preserved exactly.

### Hardcoded string fixes (from previous approved plan)

These were also not completed in the interrupted session:

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Replace hardcoded "Train. Stay. Compete." with `t("auth.tagline")` |
| `src/pages/GuestAuth.tsx` | Replace hardcoded "Fighter's Quarters" with `t("guestAuth.tagline")` |
| `src/components/DashboardLayout.tsx` | Replace "Menu" with `t("common.menu")` and "Ground Stay" with `t("auth.groundStay")` |
| `src/components/GuestLayout.tsx` | Replace "Ground Stay" with `t("auth.groundStay")` |
| `src/components/AppSidebar.tsx` | Replace "Ground Stay" with `t("auth.groundStay")` |

New keys to add to `en.json` (and all locale files):
- `"common.menu": "Menu"`
- `"auth.tagline": "Train. Stay. Compete."`
- `"guestAuth.tagline": "Fighter's Quarters"`

---

## Summary of all files touched

| File | Action |
|------|--------|
| `src/hooks/useLaundryRequests.ts` | Add staff notifications on new request; add guest notification on "in_progress" |
| `src/hooks/useMaintenanceRequests.ts` | Add guest notifications on "in_progress" and "resolved" |
| `src/i18n/locales/en.json` | Add 3 new keys (tagline, menu) |
| `src/i18n/locales/th.json` | Create (full Thai translation) |
| `src/i18n/locales/fr.json` | Create (full French translation) |
| `src/i18n/locales/de.json` | Create (full German translation) |
| `src/i18n/locales/ru.json` | Create (full Russian translation) |
| `src/i18n/locales/zh.json` | Create (full Chinese translation) |
| `src/i18n/locales/ja.json` | Create (full Japanese translation) |
| `src/i18n/locales/ko.json` | Create (full Korean translation) |
| `src/i18n/locales/es.json` | Create (full Spanish translation) |
| `src/pages/Auth.tsx` | Replace hardcoded tagline |
| `src/pages/GuestAuth.tsx` | Replace hardcoded tagline |
| `src/components/DashboardLayout.tsx` | Replace hardcoded "Menu" and "Ground Stay" |
| `src/components/GuestLayout.tsx` | Replace hardcoded "Ground Stay" |
| `src/components/AppSidebar.tsx` | Replace hardcoded "Ground Stay" |

No new dependencies. No database changes needed.

