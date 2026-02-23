
# Tutorial Onboarding Layer

## Overview
Add a guided tutorial system that walks users through each tab's capabilities on first login, supports all 9 languages, and can be reset from Settings.

## How It Works

**First Login Detection**: A new `tutorial_completed` boolean column on the `profiles` table (default `false`). When a user logs in and this is `false`, the tutorial activates automatically.

**Tutorial Component**: A reusable `TutorialOverlay` component that displays a series of step cards -- one per accessible tab -- explaining what each section does. It uses a stepped dialog/modal with:
- Tab icon and name
- 2-3 bullet points describing key capabilities
- "Next" / "Back" / "Skip" / "Finish" navigation
- Progress indicator (e.g., step 3 of 7)

**Role-Aware Steps**: The tutorial only shows steps for tabs the user's role can access (using the existing `canAccessRoute` function). Guests see a separate guest-portal tutorial.

**Multi-Language**: All tutorial text is added to the existing i18n translation files (all 9 languages). Content renders in whatever language the user has selected.

**Reset in Settings**: A "Reset Tutorial" button in the Profile tab of Settings that sets `tutorial_completed` back to `false` and relaunches the tutorial.

## Architecture

```text
profiles table
  + tutorial_completed (boolean, default false)

Components:
  TutorialOverlay.tsx    -- Full-screen stepped overlay
  useTutorial.ts         -- Hook: reads/writes tutorial state

Pages touched:
  DashboardLayout.tsx    -- Mounts <TutorialOverlay /> after auth
  GuestLayout.tsx        -- Mounts <TutorialOverlay /> for guests
  ProfileEditor.tsx      -- Adds "Reset Tutorial" button
```

## Step Content (Staff)

| Step | Tab | Key Points |
|------|-----|------------|
| 1 | Dashboard | Overview stats, arrivals/departures, quick actions, maintenance queue |
| 2 | Units | Add/edit accommodation units, photos, groups, amenities |
| 3 | Bookings | Manage reservations, state transitions, approval queue |
| 4 | Calendar | Visual availability, maintenance blocks, timeline/month/day views |
| 5 | Pricing | Seasonal rules, long-stay discounts, operational policies |
| 6 | Reports | Occupancy, revenue, booking state breakdown, account census |
| 7 | Messages | Guest conversations, internal notes, real-time chat |
| 8 | Embeds | Generate embed widgets for external websites |
| 9 | Settings | Profile, user roles, policies, reviews management |

Steps are filtered by role -- a front desk user won't see Units, Pricing, or Embeds.

## Step Content (Guest)

| Step | Key Points |
|------|------------|
| 1 | My Bookings -- view, request, cancel reservations |
| 2 | Messages -- communicate with staff |
| 3 | Documents -- upload ID for check-in |
| 4 | Profile -- update contact info and language |

## Technical Details

### 1. Database Migration
Add column to profiles:
```sql
ALTER TABLE public.profiles
ADD COLUMN tutorial_completed boolean NOT NULL DEFAULT false;
```
No new RLS needed -- existing "Users can update own profile" policy covers it.

### 2. `useTutorial` Hook (`src/hooks/useTutorial.ts`)
- Reads `tutorial_completed` from profiles via existing `useProfile` pattern
- Provides `showTutorial` boolean, `completeTutorial()`, and `resetTutorial()` functions
- `completeTutorial` sets `tutorial_completed = true` in the database
- `resetTutorial` sets it back to `false` and triggers re-render

### 3. `TutorialOverlay` Component (`src/components/TutorialOverlay.tsx`)
- Renders as a full-screen overlay with backdrop blur
- Uses Dialog from radix for accessibility (keyboard nav, focus trap)
- Each step: icon, translated title, translated bullet points
- Accepts `variant="staff" | "guest"` to select step set
- Steps filtered by role using `canAccessRoute`
- "Skip" dismisses and marks complete; "Finish" on last step marks complete
- Smooth fade/slide transitions between steps

### 4. i18n Keys
Add `tutorial` namespace to all 9 locale files:
```json
{
  "tutorial": {
    "welcome": "Welcome to Ground Stay!",
    "letsGetStarted": "Let us show you around.",
    "next": "Next",
    "back": "Back",
    "skip": "Skip Tutorial",
    "finish": "Get Started",
    "stepOf": "Step {{current}} of {{total}}",
    "resetTutorial": "Reset Tutorial",
    "resetTutorialDesc": "Re-launch the guided walkthrough",
    "tutorialReset": "Tutorial will show on next page load",
    "dashboard": {
      "title": "Dashboard",
      "point1": "See today's arrivals, departures, and active bookings at a glance",
      "point2": "Access quick actions to create bookings or manage units",
      "point3": "Monitor maintenance requests and laundry queue"
    },
    "units": { ... },
    "bookings": { ... },
    ...
    "guest": {
      "bookings": { "title": "My Bookings", "point1": "...", ... },
      "messages": { ... },
      ...
    }
  }
}
```
All 9 language files (en, th, fr, de, ru, zh, ja, ko, es) will receive full translations.

### 5. Integration Points
- **DashboardLayout.tsx**: Add `<TutorialOverlay variant="staff" />` inside the layout, conditionally rendered when `showTutorial` is true
- **GuestLayout.tsx**: Add `<TutorialOverlay variant="guest" />` similarly
- **ProfileEditor.tsx**: Add a "Reset Tutorial" button in the profile form that calls `resetTutorial()`

### 6. Behavior
- Tutorial auto-launches once after first login (profile exists but `tutorial_completed = false`)
- Completing or skipping persists `tutorial_completed = true` to the database
- Resetting from Settings sets it to `false` and immediately shows the overlay
- Language switch mid-tutorial works because all text goes through `t()`
- No localStorage dependency -- state is database-backed and syncs across devices
