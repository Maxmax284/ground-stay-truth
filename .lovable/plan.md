

## Plan: Add Undo Button for Drag-Drop Moves

### Approach
Store the previous booking values before applying the drag update. After a successful mutation, show a floating undo toast/bar with a 10-second countdown. Clicking "Undo" reverts the booking to its original values and logs the revert.

### Changes

**`src/pages/CalendarView.tsx`**
1. Add state: `undoData` holding `{ bookingId, oldCheckIn, oldCheckOut, oldUnitId, timeoutId }` 
2. In `dragUpdateMutation.mutationFn`: fetch `check_in, check_out, unit_id` before updating, return them alongside the result
3. In `onSuccess`: store the old values in `undoData`, start a 10-second timeout that clears it
4. Replace the simple success toast with one that includes an "Undo" action button
5. Add `undoMutation` that reverts `check_in`, `check_out`, `unit_id` back to old values and logs "Calendar drag: reverted" to `booking_state_log`
6. On undo success: clear `undoData`, invalidate queries, show confirmation toast

### UI
- The existing toast system supports an `action` prop (ToastAction component) — use that to render an "Undo" button directly in the success toast
- Toast auto-dismisses after 10 seconds (matches the undo window)

No database changes needed.

