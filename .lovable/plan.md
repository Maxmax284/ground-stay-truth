

# Guest Portal Overhaul -- Missing Features

## What's Missing Today

Looking at the current Guest Portal (`/guest`), here is what a guest can actually do vs. what they should be able to do:

| Feature | Current State | Needed |
|---------|--------------|--------|
| View own bookings | Yes | Yes |
| Send messages on a booking | Yes (inline, collapsed) | Needs its own dedicated Messages tab |
| Request/create a booking | No | Yes -- guests should be able to submit booking inquiries |
| View listings | Yes | Yes |
| View policies | Yes | Yes |
| View calendar | Yes (own bookings) | Yes |
| Upload ID documents | No | Yes -- guests need to upload their own ID for check-in |
| Edit profile (name, phone) | No | Yes -- guests should manage their own profile |
| Guest self-registration via embed | No | Yes -- embeds should link to sign-up |
| Standalone Messages tab | No | Yes -- a proper inbox view, not just per-booking toggles |

## Plan

### 1. Guest Booking Request Form

Add a "Request Booking" button on the Guest Portal (visible in the Listings tab on each unit card and as a floating action in the Bookings tab). This opens a simplified version of the staff BookingFormDialog tailored for guests:

- Guest selects a unit, check-in date, check-out date, number of guests, and optional notes
- The booking is automatically created in `inquiry` state with the guest's own user ID as `guest_id`
- No guest selection dropdown (it's always the logged-in user)
- Shows pricing breakdown (reuses existing `calculatePricing` logic)
- Validates minimum nights, capacity, maintenance conflicts
- After submission, shows a confirmation and the booking appears in "My Bookings"

**Files:**
- Create `src/components/GuestBookingRequestForm.tsx` -- simplified booking dialog for guests
- Modify `src/pages/GuestPortal.tsx` -- add "Request Booking" buttons to unit cards and bookings tab

### 2. Dedicated Messages Tab

Replace the current inline per-booking message toggles with a proper **Messages** tab in the Guest Portal. This gives guests a single inbox view of all their booking conversations:

- Tab shows list of booking threads (unit name + dates + unread indicator)
- Clicking a thread opens the conversation with full message history
- Guest can send replies
- Uses Supabase Realtime for instant updates (same pattern as staff Messages page)
- The per-booking inline messaging in the booking cards stays as a quick-access shortcut

**Files:**
- Modify `src/pages/GuestPortal.tsx` -- add "Messages" tab with inbox-style view

### 3. Guest Profile Editor

Add a **Profile** section (either as a tab or in the header dropdown) where guests can:

- Edit their full name
- Edit their phone number
- View their email (read-only, since it's their auth email)

This reuses the existing `useProfile` hook and `ProfileEditor` component, adapted for the guest layout.

**Files:**
- Modify `src/pages/GuestPortal.tsx` -- add Profile tab
- Modify `src/components/ProfileEditor.tsx` -- ensure it works standalone outside DashboardLayout (it likely already does)

### 4. Guest Document Upload

Guests need to upload their ID documents for check-in (this is a requirement of the booking state machine -- ID upload is mandatory before check-in). Add a document upload section within each booking card:

- Shows on bookings in `confirmed` or `pending_deposit` state
- "Upload your ID" button opens the existing `GuestDocumentUpload` component
- Shows upload status (uploaded/not uploaded) on the booking card

**Files:**
- Modify `src/pages/GuestPortal.tsx` -- integrate `GuestDocumentUpload` into booking cards

### 5. Embed-to-Registration Flow

Currently, embed widgets (listing cards, availability calendars, CTAs) on the external WordPress site have no path to account creation. The CTA widget just shows "Check Availability" with a configurable contact URL.

Changes:
- Add a new embed widget option: "Book Now" CTA that links directly to the Guest Portal sign-up page (`/auth?register=true`)
- Update the existing CTA widget to optionally link to the guest portal registration
- Add a `register` query param to the Auth page that defaults to the sign-up form instead of sign-in
- The embed code generator gets a new option to choose between "Contact URL" and "Guest Portal Registration" as the CTA target

**Files:**
- Modify `src/pages/Auth.tsx` -- respect `?register=true` to default to sign-up mode
- Modify `src/pages/EmbedWidget.tsx` -- add guest portal registration URL option to CTA widget
- Modify `src/components/EmbedCodeGenerator.tsx` -- add CTA target option (contact URL vs guest portal)

### 6. Translation Keys

Add all new UI strings to `src/i18n/locales/en.json` for the new features.

---

## Technical Details

### Guest Booking Request Form

The form is a simplified version of `BookingFormDialog`. Key differences from the staff version:
- No guest selector (auto-assigns to current user)
- No admin override for cleaning buffers
- Uses the same `useCreateBooking` hook
- Same pricing calculator and validation logic
- RLS policy on `bookings` table already allows inserts where `guest_id = auth.uid()`

### Messages Tab Architecture

The guest Messages tab reuses the same `messages` table. The existing RLS policies should already allow guests to read messages on their own bookings (where `booking_id` is in a booking with `guest_id = auth.uid()`). The tab will:
1. Query all messages for the guest's booking IDs
2. Group by booking
3. Show unread indicators (messages not from the guest)
4. Subscribe to realtime changes

### Auth Registration Flow

The Auth page currently defaults to login. Adding `?register=true` support:
```typescript
const [searchParams] = useSearchParams();
const [isLogin, setIsLogin] = useState(searchParams.get("register") !== "true");
```

When a new user signs up, they get the `guest` role automatically (or no role, which shows "Pending Access"). The system should assign `guest` role on signup -- this may need a database trigger if not already in place.

### File Change Summary

| File | Action |
|------|--------|
| `src/components/GuestBookingRequestForm.tsx` | Create -- guest booking dialog |
| `src/pages/GuestPortal.tsx` | Modify -- add Messages tab, Profile tab, booking request buttons, document upload integration |
| `src/pages/Auth.tsx` | Modify -- support `?register=true` query param |
| `src/pages/EmbedWidget.tsx` | Modify -- add guest portal registration CTA option |
| `src/components/EmbedCodeGenerator.tsx` | Modify -- add CTA target toggle |
| `src/i18n/locales/en.json` | Modify -- add new translation keys |

### Execution Order

1. Guest Booking Request Form + buttons in portal
2. Dedicated Messages tab
3. Profile editor tab
4. Document upload in booking cards
5. Embed-to-registration flow
6. Translation keys throughout

