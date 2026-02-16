
# Operational Hardening and Governance Enhancement

A structured, phased plan to prevent operational drift, enforce UI discipline per role, introduce admin role simulation, and reinforce override governance -- all within the existing architecture.

---

## Current State Findings

**What works well:**
- `permissions.ts` is the single source of truth for all role checks, consumed consistently across every component
- `stay_support_log` table already logs laundry and maintenance actions with `changed_by`, `from_status`, `to_status`, and `note`
- Booking state machine is airtight with 9 states, mandatory audit logging, and AI pre-flight validation
- Notifications fire on state transitions, deposits, and new requests
- Deposit policy governance is fully centralized via `getDepositPolicy()` helper

**Gaps identified:**
1. **No override path for laundry/maintenance** -- status can only advance forward; a Manager cannot skip or jump statuses
2. **No `change_type` field** on `stay_support_log` -- cannot distinguish normal status changes from overrides
3. **Missing guest notification on maintenance resolution** -- guest only gets notified on laundry "ready for pickup", not on maintenance state changes
4. **Maintenance role sees LaundryPanel but cannot advance laundry** -- `canUpdateLaundryStatus` requires `front_desk+`, but LaundryPanel renders for maintenance role on dashboard, creating a dead-button scenario
5. **No role preview simulation** for admin testing
6. **No staleness advisory in AI digest** -- AI reports counts but doesn't flag items stuck in intermediate states
7. **Policy changes have no notifications** -- toggling deposit or AI settings fires no alerts to staff

---

## Phase A -- Operational Drift Control

### Database Change

Add `change_type` column to `stay_support_log`:

```sql
ALTER TABLE public.stay_support_log
  ADD COLUMN IF NOT EXISTS change_type text NOT NULL DEFAULT 'normal';
```

Valid values: `normal`, `override`

This uses the existing table. No new tables created.

### Hook Enhancements

**`src/hooks/useLaundryRequests.ts`**

Add a new `useOverrideLaundryStatus` mutation (Manager+) that:
- Accepts `target_status` (any valid laundry status), `reason` (required)
- Writes to `laundry_requests` with the new status
- Logs to `stay_support_log` with `change_type: 'override'` and the reason in `note`
- Notifies admins: "Laundry status overridden by [name]. Reason: [reason]"
- Notifies guest only if target status is `ready_for_pickup` or `collected`

**`src/hooks/useMaintenanceRequests.ts`**

Add a new `useOverrideMaintenanceStatus` mutation (Manager+) that:
- Accepts `target_status` (any valid maintenance status), `reason` (required), optional `resolution_note`
- Writes to `maintenance_requests` with the new status
- Logs to `stay_support_log` with `change_type: 'override'` and reason
- Notifies admins on override
- Notifies guest on resolution

Also enhance `useUpdateMaintenanceStatus` to notify guest when status changes to `resolved` or `in_progress` (currently missing).

### Permission Addition

Add to `src/lib/permissions.ts`:
```
canOverrideStaySupport: (role) => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager
```

### UI Changes

**`src/components/MaintenanceQueue.tsx`** and **`src/components/LaundryPanel.tsx`**:
- Add a small "Override" dropdown button (visible only to Manager+)
- Override requires a text reason in a popover/dialog before executing
- Override status changes display with an "Override" badge in the log

**`src/components/BookingDetailSheet.tsx` (Support tab)**:
- Add override buttons for Manager+ on the inline maintenance/laundry items
- Same reason-required flow as dashboard panels

### AI Enhancement

Update `supabase/functions/ai-assistant/index.ts` digest mode:
- Query `created_at` of open maintenance and in-progress laundry
- If any item has been in intermediate state for >24 hours, include advisory line: "Heads up: [X] maintenance requests have been open for over 24 hours"
- AI remains read-only

### Notification Gap Fix

Add guest notifications for:
- Maintenance moved to `in_progress`: "Your maintenance request is being worked on"
- Maintenance `resolved`: "Your maintenance request has been resolved"
- Override used (admin notification only): "[Type] status overridden by [name]. Reason: [reason]"

---

## Phase B -- Role UI Discipline Audit

### Findings Per Role

| Role | Component | Issue | Fix |
|------|-----------|-------|-----|
| **Maintenance** | `LaundryPanel` on dashboard | Sees advance buttons but `canUpdateLaundryStatus` is `front_desk+` -- buttons render but fail | Hide LaundryPanel advance buttons for maintenance role, show read-only status |
| **Maintenance** | Dashboard | Gets full LaundryPanel which is outside scope | Show laundry as read-only list (no action buttons) |
| **Front Desk** | `BookingDetailSheet` payments tab | Can see payment form but `canRecordPayment` requires Supervisor+ | Already gated by `canRecord` -- verified correct |
| **Front Desk** | `PolicySettingsForm` | Cannot access (gated by `canManagePolicies`) | Correct |
| **Viewer** | Dashboard | Quick Actions hidden, maintenance/laundry hidden | Correct |
| **Guest** | `GuestStaySupport` | Can create requests but cannot see override/status controls | Correct |

### Changes

**`src/components/LaundryPanel.tsx`**:
- For maintenance role: render status list as read-only (no advance buttons)
- This fixes the dead-button scenario

**`src/pages/Index.tsx` (MaintenanceDashboard)**:
- Keep MaintenanceQueue with full controls (maintenance can start/resolve)
- Show LaundryPanel as informational only for maintenance role

No other dead buttons or leaked controls found across the audited components.

---

## Phase C -- Super Admin "Preview As Role" Mode

### Architecture

**Client-side simulation only.** No database mutation, no RLS bypass, no backend changes.

**New context: `src/hooks/useRolePreview.tsx`**

A React context that stores:
```typescript
{
  previewRole: AppRole | null;
  setPreviewRole: (role: AppRole | null) => void;
  effectiveRole: AppRole; // previewRole ?? actualRole
  isPreviewMode: boolean;
}
```

**Integration with `useAuth`**:
- `useRolePreview` wraps around the existing auth context
- Components that call `useAuth().role` continue working
- A new `useEffectiveRole()` hook returns `previewRole ?? role`
- Permission helpers already accept role as a parameter -- callers pass `effectiveRole` instead of `role`

**Key constraint:** The backend (RLS, edge functions) still uses the real user token. Preview mode only affects:
- Which nav items render
- Which buttons appear/hide
- Which dashboard layout displays
- Which permission checks evaluate to true/false in the UI

Preview mode does NOT:
- Allow mutations beyond the admin's actual authority
- Bypass RLS (backend still sees admin token)
- Fetch data the admin couldn't already see (admin has full SELECT access)

### UI

**Banner:** A persistent warning bar at the top of DashboardLayout when preview mode is active:
```
PREVIEW MODE: Viewing as [Role Name] -- This is a simulation. Actions still require your actual role. [Exit Preview]
```

**Trigger:** Add a role selector dropdown in `AppSidebar.tsx` footer (admin only), next to the existing "Preview Guest Portal" link. Options: Front Desk, Supervisor, Manager, Maintenance, Viewer.

**Exit:** One-click button in the banner, or selecting "Exit Preview" from the dropdown.

### Files

| File | Change |
|------|--------|
| `src/hooks/useRolePreview.tsx` (new) | React context for preview role state |
| `src/App.tsx` | Wrap with `RolePreviewProvider` |
| `src/components/DashboardLayout.tsx` | Show preview banner when active |
| `src/components/AppSidebar.tsx` | Add role selector dropdown for admin |
| `src/pages/Index.tsx` | Use `effectiveRole` for conditional rendering |
| `src/components/BookingStateTransition.tsx` | Use `effectiveRole` for permission display |
| `src/components/BookingDetailSheet.tsx` | Use `effectiveRole` for permission display |
| `src/components/MaintenanceQueue.tsx` | Use `effectiveRole` |
| `src/components/LaundryPanel.tsx` | Use `effectiveRole` |

All mutation hooks continue using the real role from `useAuth()` -- preview only affects rendering.

---

## Phase D -- Override Governance Standard

### Audit of All Override Points

| Override | Reason Required | Logged | Notification | AI Aware |
|----------|:---:|:---:|:---:|:---:|
| Admin booking state override | Yes (reason field) | Yes (`booking_state_log`) | Yes (guest + admins) | Yes (validate mode) |
| Manager deposit override | Yes (reason field) | Yes (`booking_state_log` with prefix) | Yes (admins) | Yes (validate mode) |
| Early check-in override | Yes (reason + approval) | Yes (`early_checkin_requests`) | Yes (staff) | Yes (validate mode) |
| Laundry status override | **NEW** | **NEW** (`stay_support_log`) | **NEW** | **NEW** |
| Maintenance status override | **NEW** | **NEW** (`stay_support_log`) | **NEW** | **NEW** |

All existing overrides are already compliant. Phase A adds the missing laundry/maintenance override governance.

### Stall State Analysis

| State | Can Stall? | Recovery Path |
|-------|:---:|-------------|
| `soft_hold` | Yes (12h expiry) | Expiry banner shown, staff can transition |
| `pending_deposit` | Yes (24h expiry) | Expiry banner shown, staff can cancel or confirm |
| `pending_approval` | Yes (no auto-expiry) | Approval queue on dashboard, sidebar badge |
| Maintenance `open` | Yes (no expiry) | **NEW: AI digest flags >24h stale items** |
| Maintenance `in_progress` | Yes (no expiry) | **NEW: AI digest flags >24h stale items** |
| Laundry `in_progress` | Yes (no expiry) | **NEW: AI digest flags >24h stale items** |
| Laundry `ready_for_pickup` | Yes (no expiry) | **NEW: AI digest flags >24h stale items** |

No state can permanently stall without an escalation path after these changes.

---

## Phase E -- UX Resilience

### Mobile (360px)

- MaintenanceQueue and LaundryPanel already use flex-wrap for badges
- Override buttons will use small variant (`size="sm"`) and popover dialogs (not modals) for reason input
- Preview mode banner uses fixed positioning, single line with exit button
- No layout shifts from new controls -- all additions are conditional renders within existing card boundaries

### Tablet and Desktop

- Override dropdown renders inline with existing action buttons
- Preview mode selector in sidebar footer uses existing dropdown patterns
- No new navigation items or routes

### Role Clarity

- All override buttons are labeled "Override" with a distinct icon
- Override actions require explicit confirmation (reason + submit)
- Preview mode has a visually distinct warning banner (amber/orange, full-width)
- No button renders without a clear label explaining what it does

---

## Phase F -- System Integrity Confirmation

### Single Sources of Truth (preserved)

- **Permissions**: `src/lib/permissions.ts` -- all new permissions added here
- **Deposit policy**: `src/lib/depositPolicy.ts` -- unchanged
- **Role hierarchy**: `ROLE_HIERARCHY` in permissions.ts -- unchanged
- **State machine**: `src/lib/bookingStateMachine.ts` -- unchanged

### No Conflicts With

- Booking state machine (no state changes)
- Deposit policy logic (no changes)
- Policy settings toggles (no new toggles, only new permission)
- AI circuit breaker (no changes to enable/disable logic)
- RLS policies (no changes needed; `stay_support_log` already allows authenticated INSERT)

### Nothing Becomes Implicit

- Override actions are always logged with reason and change_type
- Preview mode is always visually indicated
- AI advisory reflects operational drift transparently
- Notifications fire on every override

---

## Rollout Order

1. Database migration: add `change_type` to `stay_support_log`
2. Add `canOverrideStaySupport` permission to `permissions.ts`
3. Add override mutations to `useLaundryRequests.ts` and `useMaintenanceRequests.ts`
4. Fix LaundryPanel dead-button for maintenance role
5. Add override UI to `MaintenanceQueue.tsx` and `LaundryPanel.tsx`
6. Add override UI to `BookingDetailSheet.tsx` support tab
7. Add guest notifications for maintenance status changes
8. Create `useRolePreview.tsx` context
9. Integrate preview mode into `App.tsx`, `DashboardLayout.tsx`, `AppSidebar.tsx`
10. Update consuming components to use `effectiveRole` for rendering
11. Update `ai-assistant` edge function with staleness detection
12. Add translation keys to all 9 locale files
13. Deploy edge function

## Files Summary

| File | Action |
|------|--------|
| `stay_support_log` (migration) | Add `change_type` column |
| `src/lib/permissions.ts` | Add `canOverrideStaySupport` |
| `src/hooks/useLaundryRequests.ts` | Add `useOverrideLaundryStatus`, add guest notification on advances |
| `src/hooks/useMaintenanceRequests.ts` | Add `useOverrideMaintenanceStatus`, add guest notifications |
| `src/components/LaundryPanel.tsx` | Add override UI (Manager+), fix maintenance role read-only |
| `src/components/MaintenanceQueue.tsx` | Add override UI (Manager+) |
| `src/components/BookingDetailSheet.tsx` | Add override controls in support tab |
| `src/hooks/useRolePreview.tsx` (new) | Preview role context |
| `src/App.tsx` | Wrap with RolePreviewProvider |
| `src/components/DashboardLayout.tsx` | Preview mode banner |
| `src/components/AppSidebar.tsx` | Preview role selector for admin |
| `src/pages/Index.tsx` | Use effectiveRole |
| `supabase/functions/ai-assistant/index.ts` | Add staleness detection in digest mode |
| All 9 locale files | Add translation keys for overrides, preview mode, notifications |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Preview mode accidentally allows unauthorized mutations | Mutation hooks always use real role from `useAuth()`, never preview role. Backend RLS enforces actual identity. |
| Override abuse | All overrides logged with reason, admin notified, AI reflects in digest |
| `change_type` column on existing data | Default value `'normal'` covers all existing rows |
| LaundryPanel fix removing functionality | Only hides buttons for maintenance role; Front Desk+ retains full control |

## Regression Testing Checklist

- [ ] Maintenance role: verify LaundryPanel shows statuses but no advance buttons
- [ ] Maintenance role: verify MaintenanceQueue still allows start/resolve
- [ ] Manager: verify override dropdown appears on laundry and maintenance items
- [ ] Manager override: verify reason is required before submission
- [ ] Manager override: verify `stay_support_log` entry has `change_type = 'override'`
- [ ] Manager override: verify admin receives notification
- [ ] Guest: verify notification on maintenance resolution
- [ ] Admin: verify preview mode selector appears in sidebar
- [ ] Admin preview as Front Desk: verify Manager-only buttons disappear
- [ ] Admin preview as Maintenance: verify simplified dashboard renders
- [ ] Admin preview mode: verify mutations still execute with admin authority
- [ ] Admin preview mode: verify banner is visible and exit works
- [ ] AI digest: verify stale items (>24h) are flagged in advisory
- [ ] AI validate: verify override context is included in pre-flight check
- [ ] Mobile 360px: verify override popover renders without overflow
- [ ] Existing booking state transitions: verify no regression
- [ ] Deposit flow: verify no regression in pending_deposit to confirmed
