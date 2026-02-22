

# Admin Response, Per-Unit Review Toggle & Email Notifications

## Overview

Three additions: (1) ensure admin response feature works end-to-end (already partially implemented -- verify and polish), (2) add a per-unit "reviews enabled" toggle controlled exclusively by admins, and (3) send email notifications to guests when an admin responds to their review.

## 1. Per-Unit "Reviews Enabled" Toggle

Add a `reviews_enabled` boolean column to the `units` table (default `true`). Only admins can toggle this -- it controls whether guests can leave reviews for bookings associated with that unit.

### Database Change

Add column to units table:

```text
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS reviews_enabled boolean NOT NULL DEFAULT true;
```

No new RLS policies needed -- the existing "Admins can manage units" ALL policy already covers updates, and the public SELECT policy covers reads.

### Admin UI

In the Units management page (or within the UnitFormDialog), add a "Reviews Enabled" toggle switch visible only to admins. When toggled off, guests cannot submit reviews for bookings in that unit.

### Guest-Side Enforcement

In `GuestBookingCard`, before showing the "Leave a Review" button, check whether the booking's unit has `reviews_enabled = true`. This requires fetching the unit's `reviews_enabled` status alongside the booking data (already fetched via the `units(...)` join).

In `ReviewFormDialog`, add a guard so even if someone navigates there directly, the form won't submit if the unit has reviews disabled.

### Admin ReviewsManager Enhancement

Add a small section at the top or bottom of the Reviews tab showing which units currently have reviews disabled, so admins have visibility into their own settings.

## 2. Email Notification on Admin Response

Create a new edge function `notify-review-response` that:
1. Accepts `review_id` and `admin_response` in the request body
2. Looks up the review to get the `guest_id`
3. Looks up the guest's email from the `profiles` table
4. Creates an in-app notification via the `notifications` table (using service role)
5. Sends an email to the guest informing them that management has responded to their review

The `useRespondToReview` mutation in `useReviews.ts` will call this edge function after successfully saving the response.

Since the existing email infrastructure uses notifications (the `send-booking-confirmation` function creates notifications rather than sending real emails), this will follow the same pattern -- create a notification record for the guest. When actual email sending is configured in the future, these notifications can trigger emails.

### Edge Function: `notify-review-response`

```text
- Validates JWT
- Accepts { review_id, admin_response }
- Uses service role to:
  1. Fetch review (get guest_id, title)
  2. Insert notification for guest:
     type: "review_response"
     message: "Management has responded to your review: [title]"
     reference_id: review_id
```

### Hook Change

In `useRespondToReview`, after the successful DB update and audit log insertion, invoke the edge function to trigger the notification. This is fire-and-forget -- if the notification fails, the response itself is still saved.

## 3. Polish Existing Admin Response Feature

The admin response feature (Reply button, textarea, save/edit/remove) is already implemented in `ReviewsManager.tsx` and displayed in `TestimonialSection.tsx`. This plan ensures:
- The audit trail correctly logs `responded` and `response_removed` actions (already done)
- The public `/stay` page displays responses beneath testimonials (already done)
- Translation keys are complete across all locales

## Technical Details

### Database Migration

```text
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS reviews_enabled boolean NOT NULL DEFAULT true;
```

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/notify-review-response/index.ts` | Edge function to create guest notification when admin responds to a review |

### Modified Files

| File | Change |
|------|--------|
| `src/hooks/useReviews.ts` | Update `useRespondToReview` to call the notification edge function after saving |
| `src/pages/GuestPortal.tsx` | Check `reviews_enabled` on the unit before showing "Leave a Review" button |
| `src/components/UnitFormDialog.tsx` | Add "Reviews Enabled" toggle (admin-only) |
| `src/components/ReviewsManager.tsx` | Show list of units with reviews disabled for admin awareness |
| `src/i18n/locales/en.json` | Add keys: `units.reviewsEnabled`, `units.reviewsDisabled`, `reviews.reviewsDisabledForUnit`, `reviews.responseNotificationSent`, `reviews.unitsWithReviewsDisabled` |
| `src/i18n/locales/*.json` | Propagate to all 8 other locales |

### Edge Function Config

Add to `supabase/config.toml`:
```text
[functions.notify-review-response]
verify_jwt = false
```

### Data Flow for Admin Response + Notification

1. Admin clicks "Reply" on an approved review in ReviewsManager
2. Admin types response and clicks Save
3. `useRespondToReview` updates `admin_response` and `admin_response_at` on the review
4. Audit log entry created with action `responded`
5. Edge function `notify-review-response` called with the review ID
6. Edge function creates a notification for the guest: "Management has responded to your review"
7. Guest sees the notification in their notification bell
8. On the public `/stay` page, the response appears beneath the testimonial

### Per-Unit Toggle Flow

1. Admin opens unit settings in UnitFormDialog
2. Toggles "Reviews Enabled" on/off
3. When disabled, guests with completed bookings for that unit will NOT see the "Leave a Review" button
4. Already-submitted reviews for that unit are unaffected (they remain in the system)
5. The toggle only controls future review submissions

