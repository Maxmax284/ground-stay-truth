

# Post-Stay Review & Testimonial System

## Overview

Build a complete review lifecycle: guests leave star-rated feedback after completing a stay, admins approve/reject reviews before they go public, and approved reviews display as social proof on the `/stay` landing page. A new "Reviews" management tab in Settings gives admins full control.

## What Gets Built

### 1. New Database Table: `reviews`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `booking_id` | uuid | - | FK to bookings, unique (one review per stay) |
| `guest_id` | uuid | - | The reviewer |
| `rating` | integer | - | 1-5 stars |
| `title` | text | - | Short headline |
| `body` | text | - | Review content |
| `status` | text | `'pending'` | `pending`, `approved`, `rejected` |
| `admin_note` | text | null | Internal reason for rejection |
| `reviewed_by` | uuid | null | Admin who approved/rejected |
| `reviewed_at` | timestamptz | null | When admin acted |
| `guest_display_name` | text | null | Snapshot of guest name at submission time |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

RLS policies:
- **Guests** can INSERT reviews for their own completed bookings (one per booking)
- **Guests** can SELECT their own reviews
- **Anon/public** can SELECT where `status = 'approved'` (for the `/stay` page)
- **Staff (front_desk+)** can SELECT all reviews
- **Admins** can UPDATE reviews (approve/reject) and DELETE

### 2. Guest Portal - Leave a Review

On the **Bookings tab** in GuestPortal, past bookings with state `completed` get a "Leave a Review" button (only if no review exists for that booking yet).

Clicking opens a dialog with:
- 5-star rating selector (clickable stars using the Star icon from lucide)
- Title field (required, max 100 chars)
- Body textarea (required, max 1000 chars)
- Submit button

After submission, the card shows "Review submitted - pending approval" with the stars displayed.

### 3. Admin Reviews Management

Add a new **"Reviews"** tab in the Settings page (visible to admins only, using `canManagePolicies` or a new `canManageReviews` permission).

The tab shows:
- Filter tabs: All / Pending / Approved / Rejected
- Each review card displays: guest name, star rating, title, body excerpt, booking dates, unit name, submission date
- Action buttons per review:
  - **Approve** (moves to `approved` -- becomes visible on `/stay`)
  - **Reject** with optional admin note (reason field)
  - **Remove** (delete entirely for spam/inappropriate content)
- Pending count badge on the Reviews tab trigger

### 4. Public `/stay` Page - Testimonials Section

Add a "What Our Guests Say" section between the Camp Info and Footer CTA sections:
- Fetch approved reviews (ordered by most recent, limit 6)
- Display as a grid of testimonial cards with:
  - Star rating (filled/empty stars)
  - Review title in bold
  - Body text (truncated to 3 lines)
  - Guest display name and stay date
- Overall rating summary: average stars + total review count
- Only renders if there are approved reviews (no empty state on public page)

### 5. Overall Rating Display

- Calculate and display aggregate stats: average rating (to 1 decimal) and total approved review count
- Show on the `/stay` hero area as a subtle badge: "4.8 (23 reviews)"
- Show on the admin Reviews tab as summary cards

### 6. New Permission

Add to `permissions.ts`:
- `canManageReviews`: Admin only (same as `canManagePolicies`)

### 7. Translation Keys

Add `reviews.*` keys to all 9 locale files covering:
- `reviews.leaveReview`, `reviews.rating`, `reviews.title`, `reviews.body`
- `reviews.submitReview`, `reviews.pendingApproval`
- `reviews.approve`, `reviews.reject`, `reviews.remove`
- `reviews.whatGuestsSay`, `reviews.overallRating`, `reviews.basedOnReviews`
- `reviews.pending`, `reviews.approved`, `reviews.rejected`
- `reviews.adminNote`, `reviews.rejectReason`
- `reviews.noReviews`, `reviews.alreadyReviewed`

## Technical Details

### Database Migration

```sql
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  guest_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Guests insert own reviews for completed bookings
CREATE POLICY "Guests can insert own reviews" ON public.reviews
  FOR INSERT WITH CHECK (
    guest_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = reviews.booking_id
        AND bookings.guest_id = auth.uid()
        AND bookings.state = 'completed'
    )
  );

-- Guests can read own reviews
CREATE POLICY "Guests can read own reviews" ON public.reviews
  FOR SELECT USING (guest_id = auth.uid());

-- Anyone can read approved reviews (public testimonials)
CREATE POLICY "Anyone can read approved reviews" ON public.reviews
  FOR SELECT USING (status = 'approved');

-- Staff can read all reviews
CREATE POLICY "Staff can read all reviews" ON public.reviews
  FOR SELECT USING (has_role(auth.uid(), 'front_desk'::app_role));

-- Admins can manage reviews
CREATE POLICY "Admins can manage reviews" ON public.reviews
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/useReviews.ts` | Hook for CRUD operations on reviews (guest submit, admin approve/reject/delete, public fetch) |
| `src/components/ReviewFormDialog.tsx` | Guest-facing star rating + review form dialog |
| `src/components/ReviewsManager.tsx` | Admin reviews management component with filter tabs and action buttons |
| `src/components/TestimonialSection.tsx` | Public `/stay` testimonial grid with star display and aggregate rating |
| `src/components/StarRating.tsx` | Reusable star rating component (display + interactive modes) |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/GuestPortal.tsx` | Add "Leave a Review" button on completed booking cards |
| `src/pages/Stay.tsx` | Add testimonial section |
| `src/pages/Settings.tsx` | Add "Reviews" tab for admins |
| `src/lib/permissions.ts` | Add `canManageReviews` |
| `src/i18n/locales/en.json` | Add `reviews.*` keys |
| `src/i18n/locales/*.json` | Propagate to all 8 other locales |

### Public Page Data Flow

The `/stay` page fetches approved reviews without authentication using the anon key, similar to how it fetches `policy_settings` and unit data. The "Anyone can read approved reviews" RLS policy enables this.

### Guardrails

- One review per booking (unique constraint on `booking_id`)
- Only `completed` bookings can be reviewed (RLS enforced)
- Reviews start as `pending` -- never public until admin approves
- Admins can reject with a note or delete entirely
- Star rating constrained to 1-5 at database level
- Input validation with length limits on title (100) and body (1000)

