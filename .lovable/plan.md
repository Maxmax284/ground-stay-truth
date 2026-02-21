

# Review System Compliance, Audit Trail & Anti-Fraud Enhancements

## Overview

Harden the existing review system to be compliant, auditable, and resistant to fraud or orchestrated false advertising. This means adding a full audit trail for every admin action on reviews, enforcing verification that reviews come only from real completed stays, adding anti-gaming safeguards, and surfacing transparency indicators on public-facing reviews.

## What Gets Built

### 1. Review Audit Log Table

A new `review_audit_log` table that records every moderation action (approve, reject, delete) with who did it and when. This creates an immutable paper trail.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| review_id | uuid | The review acted upon |
| action | text | `approved`, `rejected`, `deleted`, `edited` |
| performed_by | uuid | Admin who took action |
| reason | text | Required for rejections, optional otherwise |
| metadata | jsonb | Snapshot of review state at time of action (rating, title, body, status) |
| created_at | timestamptz | Immutable timestamp |

RLS: Admin-only read/write. No updates or deletes allowed (append-only log).

### 2. Verified Stay Badge

Add a "Verified Stay" indicator on public testimonials to prove the review comes from someone who actually completed a booking. This is the anti-fraud cornerstone.

- On the `/stay` testimonials: each review card gets a small "Verified Stay" badge with a shield icon
- The verification is inherent -- RLS already ensures only guests with `completed` bookings can insert reviews, so every approved review is by definition from a verified stay
- Display the stay duration (e.g., "Stayed 14 nights") alongside the guest name for authenticity

### 3. Anti-Fraud Safeguards

**Time-gating**: Guests can only leave a review between 24 hours and 90 days after checkout. This prevents:
- Immediate emotional reviews (cooling-off period)
- Ancient reviews that could be orchestrated long after the fact

**Content validation**: 
- Minimum 20 characters for the review body (prevent spam/placeholder reviews)
- Minimum 10 characters for the title

**Rate limiting**: The existing UNIQUE constraint on `booking_id` already prevents multiple reviews per stay. No additional changes needed.

**No self-review visibility on public page**: Guest display names on the public page show first name + last initial only (e.g., "John D.") to prevent identifying and targeting specific reviewers.

### 4. Enhanced Admin ReviewsManager

**Audit trail visibility**: Add an expandable "Moderation History" section for each review showing who approved/rejected/deleted and when.

**Review metadata on admin cards**:
- Show booking dates (check-in / check-out) so admins can verify the stay actually happened
- Show stay duration
- Show unit name
- Show if the guest is a repeat guest (stay count)

**Bulk actions**: No bulk approve -- each review must be individually reviewed to prevent rubber-stamping (compliance guardrail).

**Admin rejection requires a note**: Make the rejection reason field mandatory (currently optional). This creates accountability.

### 5. Public Testimonial Enhancements

**Aggregate rating transparency**:
- Show total number of reviews alongside average
- Show rating distribution bar chart (how many 5-star, 4-star, etc.)
- This prevents cherry-picking perception -- visitors see the full picture

**Review date displayed**: Show "Stayed in [Month Year]" not just the review submission date.

**"All reviews moderated" disclosure**: Small text at the bottom: "All reviews are from verified guests and moderated by management" -- standard compliance language.

### 6. Staff Visibility

Add review information to `BookingDetailSheet` so staff can see if a completed booking has a review, and its status. Read-only for non-admins.

## Technical Details

### Database Migration

```text
-- New audit log table (append-only)
CREATE TABLE review_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid NOT NULL,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: Admin read + insert only, no update/delete
ALTER TABLE review_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log" ON review_audit_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit log" ON review_audit_log
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add booking metadata columns to reviews for public display
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stay_check_in date;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stay_check_out date;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stay_unit_name text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stay_nights integer;
```

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useReviews.ts` | Add audit log insertion on approve/reject/delete; add time-gate check; fetch booking metadata on submit |
| `src/components/ReviewFormDialog.tsx` | Add time-gate validation (24h-90d window); enforce min lengths; snapshot booking dates on submit |
| `src/components/ReviewsManager.tsx` | Show booking metadata; mandatory rejection notes; audit trail accordion per review |
| `src/components/TestimonialSection.tsx` | Verified badge; rating distribution; stay duration; privacy-safe names; moderation disclosure |
| `src/components/BookingDetailSheet.tsx` | Show review status for completed bookings |
| `src/components/StarRating.tsx` | No changes needed |
| `src/i18n/locales/en.json` | Add new keys for verified stay, audit trail, time-gate messages, rating distribution |
| `src/i18n/locales/*.json` | Propagate to all 8 other locales |

### Audit Trail Flow

When an admin approves, rejects, or deletes a review:
1. The action executes on the `reviews` table (existing behavior)
2. A row is inserted into `review_audit_log` with: action type, admin user ID, reason, and a JSONB snapshot of the review's state at that moment (rating, title, body, previous status)
3. The audit log is append-only -- no updates or deletes permitted by RLS

### Time-Gate Logic

```text
checkout_date = booking.check_out
now = current timestamp

canReview = 
  now >= checkout_date + 24 hours
  AND now <= checkout_date + 90 days
  AND booking.state = 'completed'
  AND no existing review for this booking
```

Displayed to the guest as: "You can leave a review starting [date] (24 hours after checkout)" or "The review window for this stay has closed" if past 90 days.

### Privacy-Safe Display Names

On the public `/stay` page only, transform `guest_display_name` to first name + last initial:
- "John Doe" becomes "John D."
- "Maria" stays "Maria"
- null becomes "Guest"

This is a display-only transformation -- the full name remains in the database for admin reference.

### Rating Distribution

Calculate from approved reviews:
- Count of reviews per star level (1-5)
- Display as horizontal bars with percentages
- Renders above the testimonial cards grid

