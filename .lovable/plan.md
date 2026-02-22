
# Review Status in BookingDetailSheet + Admin Response Feature

## Overview

Two additions: (1) show review status for completed bookings in the staff BookingDetailSheet, and (2) add an admin response feature so admins can publicly reply to approved reviews, with the response visible on the `/stay` page.

## 1. Review Status in BookingDetailSheet

In the `BookingDetailSheet` header area (after the guest name/returning guest badge), for bookings with state `completed`:

- Query reviews for the current `booking_id`
- If a review exists, show a small badge: "Review: Pending" / "Review: Approved" / "Review: Rejected" with appropriate color
- If no review exists, show a muted "No review submitted" label
- Read-only for non-admins; no action buttons needed here

Uses the existing `useGuestReviews` pattern but queries by `booking_id` instead -- add a new `useBookingReview(bookingId)` hook to `useReviews.ts`.

## 2. Admin Response Feature

### Database Change

Add two columns to the `reviews` table:

| Column | Type | Default |
|--------|------|---------|
| `admin_response` | text | null |
| `admin_response_at` | timestamptz | null |

No new RLS policies needed -- admins already have full access via the existing "Admins can manage reviews" ALL policy, and the "Anyone can read approved reviews" SELECT policy already covers public reads of these new columns.

### Admin UI (ReviewsManager)

For approved reviews, add a "Reply" button that opens a textarea to compose a public response. The response is saved to `admin_response` and `admin_response_at` on the review row. An audit log entry is created with action `responded`. Admins can also edit or remove an existing response.

### Public UI (TestimonialSection)

On the `/stay` page, if an approved review has an `admin_response`, display it beneath the review body in a visually distinct block (e.g., slightly indented with a "Management Response" label and the response date).

### Hook Changes (useReviews.ts)

- Add `admin_response` and `admin_response_at` to the `Review` interface
- Add `useBookingReview(bookingId)` -- fetches the single review for a booking
- Add `useRespondToReview()` mutation -- updates `admin_response` and `admin_response_at`, inserts audit log entry

## Technical Details

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useReviews.ts` | Add `admin_response`/`admin_response_at` to Review interface; add `useBookingReview` hook; add `useRespondToReview` mutation |
| `src/components/BookingDetailSheet.tsx` | Import `useBookingReview`, show review status badge for completed bookings in the header |
| `src/components/ReviewsManager.tsx` | Add "Reply" button for approved reviews; textarea for composing response; display existing responses |
| `src/components/TestimonialSection.tsx` | Render admin response block beneath review body when present |
| `src/i18n/locales/en.json` | Add keys: `reviews.reviewStatus`, `reviews.noReviewSubmitted`, `reviews.managementResponse`, `reviews.reply`, `reviews.editResponse`, `reviews.removeResponse`, `reviews.responseSaved` |
| `src/i18n/locales/*.json` | Propagate to all 8 other locales |

### Database Migration

```sql
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS admin_response text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS admin_response_at timestamptz;
```

### Audit Trail

When an admin submits, edits, or removes a response, an entry is inserted into `review_audit_log` with action `responded` (or `response_removed`), including a snapshot of the response text in the metadata field.
