

# Dark/Light Mode, Notification Gaps, Role Review, and i18n Completion

This plan addresses four areas: adding a theme toggle, fixing missing notifications for laundry/maintenance flows, reviewing role permissions across all dashboards, and finishing the interrupted i18n translation work.

---

## Part 1: Dark/Light Mode Toggle

The dark mode CSS variables already exist in `src/index.css` (lines 72-120) and `next-themes` is already installed. What's missing is the theme provider setup and a toggle button.

### Changes

**`src/App.tsx`** -- Wrap the app in `ThemeProvider` from `next-themes` with `attribute="class"` and `defaultTheme="light"`.

**New file: `src/components/ThemeToggle.tsx`** -- A small button component using `useTheme()` from `next-themes` to cycle between light/dark. Uses Sun/Moon icons from lucide-react.

**`src/components/DashboardLayout.tsx`** -- Add `<ThemeToggle />` next to the `<NotificationBell />` in the header bar.

**`src/components/GuestLayout.tsx`** -- Add `<ThemeToggle />` next to the language selector in the guest header.

**`src/pages/Auth.tsx` and `src/pages/GuestAuth.tsx`** -- Add `<ThemeToggle />` near the language selector on auth pages so users can switch before logging in.

---

## Part 2: Fix Notification Gaps

Currently missing notifications:

| Event | Who should be notified | Status |
|-------|----------------------|--------|
| New laundry request submitted | Admin, Manager, Front Desk | MISSING |
| Laundry status -> in_progress | Guest | MISSING |
| Maintenance status -> in_progress | Guest | MISSING |
| Maintenance status -> resolved | Guest | MISSING |
| Laundry -> ready_for_pickup | Guest | Already works |
| New maintenance request | Admin, Manager, Maintenance | Already works |

### Changes

**`src/hooks/useLaundryRequests.ts`**

In `useCreateLaundryRequest`: after inserting, query `user_roles` for admin/manager/front_desk users and insert a notification for each (same pattern as `useCreateMaintenanceRequest`). Message: "New laundry request from [unit_name]".

In `useAdvanceLaundryStatus`: when `nextStatus === "in_progress"`, look up `booking.guest_id` and send notification "Your laundry is being processed."

**`src/hooks/useMaintenanceRequests.ts`**

In `useUpdateMaintenanceStatus`: after updating, look up `booking.guest_id` and send:
- `in_progress`: "Your maintenance request is being worked on"
- `resolved`: "Your maintenance request has been resolved"

---

## Part 3: Role Access and Permissions Review

After thorough review, here is the current state and gaps:

### Current Role Matrix (correct)

| Capability | Guest | Viewer | Maintenance | Front Desk | Supervisor | Manager | Admin |
|-----------|-------|--------|-------------|------------|------------|---------|-------|
| Dashboard | -- | View only | Maintenance-focused | Full | Full | Full | Full |
| Bookings list | -- | Read-only | -- | CRUD + transitions | CRUD + check-in/out | + Approve | + Override |
| Calendar | -- | Read-only | Read-only | Read-only | Read-only | + Maint blocks | + Maint blocks |
| Units | -- | -- | -- | -- | -- | CRUD | CRUD |
| Pricing | -- | -- | -- | -- | -- | CRUD | CRUD |
| Reports | -- | Read-only | -- | -- | -- | Read-only | Read-only |
| Messages | -- | -- | -- | Send/read | Send/read | Send/read | Send/read |
| Settings | -- | -- | -- | Profile only | Profile only | Profile + policies | Full |
| Maintenance requests | Create (own) | -- | Start + Resolve | View all | View all | Start + Resolve | Full |
| Laundry requests | Create (own) | -- | -- | Advance status | Advance status | Advance status | Full |
| Payment amounts | -- | -- | -- | Hidden | Hidden | Visible | Visible |

### Identified Gaps

1. **Maintenance role cannot see laundry panel on dashboard** -- The maintenance dashboard already shows `<LaundryPanel />`, but laundry status advancement requires `front_desk` or higher. Maintenance staff can see but can't advance laundry. This is correct per current permissions but may be confusing -- the panel should hide the advance button for maintenance role (already handled by `canUpdate` check).

2. **Front Desk staff don't see the MaintenanceQueue or LaundryPanel on their dashboard** -- Currently only the `maintenance` role gets these panels. Front Desk, Supervisors, Managers, and Admins should also see them since they receive notifications about these requests.

3. **Sidebar badges for laundry/maintenance missing for non-maintenance staff** -- The maintenance count badge only shows for `role === "maintenance"`. Admins, managers, and front desk should also see active request counts.

### Changes

**`src/pages/Index.tsx`**

Add `<MaintenanceQueue />` and `<LaundryPanel />` to the non-maintenance staff dashboard layout (after the approval queue / quick actions section), visible to front_desk+ roles.

**`src/components/AppSidebar.tsx`**

Show maintenance/laundry badge count on the dashboard nav item for admin, manager, and front_desk roles (not just maintenance).

---

## Part 4: AI Layer Alignment

The AI assistant (Kru) is already well-integrated:
- Property snapshot fetches live unit, booking, maintenance, and laundry counts
- Role-based filtering (front_desk can't see amounts, guest can't see internal notes)
- Circuit breaker per role via `policy_settings`
- Language selector in panel

### One small improvement

**`supabase/functions/ai-assistant/index.ts`** -- The snapshot already includes maintenance and laundry counts. No changes needed for data accuracy. The AI is already aligned with the current system.

---

## Part 5: Complete i18n (Interrupted Work)

All 8 locale files were never created (only `en.json` exists). Hardcoded strings in Auth pages were never fixed.

### Files to create (8 new)

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

Each mirrors the full `en.json` structure with translated values.

### Hardcoded string fixes

| File | Hardcoded | Replace with |
|------|-----------|-------------|
| `src/pages/Auth.tsx` line 55 | "Train. Stay. Compete." | `t("auth.tagline")` |
| `src/pages/GuestAuth.tsx` line 68 | "Fighter's Quarters" | `t("guestAuth.tagline")` |
| `src/components/DashboardLayout.tsx` line 39 | "Menu" | `t("common.menu")` |
| `src/components/DashboardLayout.tsx` line 41 | "Ground Stay" | `t("auth.groundStay")` |
| `src/components/GuestLayout.tsx` line 27 | "Ground Stay" | `t("auth.groundStay")` |
| `src/components/AppSidebar.tsx` line 105 | "Ground Stay" | `t("auth.groundStay")` |

New keys to add to `en.json`:
- `"common.menu": "Menu"`
- `"auth.tagline": "Train. Stay. Compete."`
- `"guestAuth.tagline": "Fighter's Quarters"`

---

## Summary of All Files

| File | Action |
|------|--------|
| `src/App.tsx` | Add ThemeProvider wrapper |
| `src/components/ThemeToggle.tsx` | **NEW** - dark/light toggle button |
| `src/components/DashboardLayout.tsx` | Add ThemeToggle + fix hardcoded strings |
| `src/components/GuestLayout.tsx` | Add ThemeToggle + fix "Ground Stay" |
| `src/components/AppSidebar.tsx` | Fix "Ground Stay" + expand badge visibility |
| `src/pages/Auth.tsx` | Add ThemeToggle + fix tagline |
| `src/pages/GuestAuth.tsx` | Add ThemeToggle + fix tagline |
| `src/pages/Index.tsx` | Add MaintenanceQueue/LaundryPanel for staff roles |
| `src/hooks/useLaundryRequests.ts` | Add staff notifications on create + guest notification on in_progress |
| `src/hooks/useMaintenanceRequests.ts` | Add guest notifications on in_progress/resolved |
| `src/i18n/locales/en.json` | Add 3 new keys |
| `src/i18n/locales/th.json` | **NEW** - full Thai translation |
| `src/i18n/locales/fr.json` | **NEW** - full French translation |
| `src/i18n/locales/de.json` | **NEW** - full German translation |
| `src/i18n/locales/ru.json` | **NEW** - full Russian translation |
| `src/i18n/locales/zh.json` | **NEW** - full Chinese translation |
| `src/i18n/locales/ja.json` | **NEW** - full Japanese translation |
| `src/i18n/locales/ko.json` | **NEW** - full Korean translation |
| `src/i18n/locales/es.json` | **NEW** - full Spanish translation |

No database changes needed. No new dependencies needed (`next-themes` is already installed).

