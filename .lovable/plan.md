
# Complete Final Two Gaps: Korean Translation + Laundry Staff Notifications

Two items remain from the full audit.

---

## 1. Create Korean Translation File

The language selector already includes Korean ("han-gug-eo") but no `ko.json` file exists, causing a silent fallback to English. This needs a complete translation file mirroring the `en.json` structure.

### File to create
- `src/i18n/locales/ko.json` -- Full Korean translation of all keys

---

## 2. Add Staff Notification for New Laundry Requests

When a guest submits a maintenance request, all relevant staff roles get notified. But when a guest submits a laundry request, no one is notified -- staff only see it if they happen to look at the Laundry Panel.

### File to modify: `src/hooks/useLaundryRequests.ts`

In `useCreateLaundryRequest` (around line 106, after the `logSupportAction` call), add the same notification pattern used in maintenance requests:

```typescript
// Notify staff about new laundry request
const { data: staff } = await supabase
  .from("user_roles")
  .select("user_id")
  .in("role", ["admin", "manager", "front_desk", "front_desk_supervisor"]);
for (const s of staff ?? []) {
  if (s.user_id !== user?.id) {
    await createNotification({
      user_id: s.user_id,
      type: "laundry",
      reference_id: data.id,
      message: `New laundry request submitted (${req.bag_count ?? 1} bag${(req.bag_count ?? 1) > 1 ? "s" : ""})`,
    });
  }
}
```

---

## Summary

| Item | Type | Description |
|------|------|-------------|
| `src/i18n/locales/ko.json` | NEW file | Complete Korean translation |
| `src/hooks/useLaundryRequests.ts` | Edit | Add staff notifications when guests submit laundry requests |

No database changes needed. No new dependencies needed. After this, every item from the original audit will be resolved.
