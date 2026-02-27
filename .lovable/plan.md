

# Comprehensive Role-Aware Tutorial Overhaul

## What Changes

The current tutorial is a generic walkthrough with 3 bullet points per page. This overhaul will make it deeply role-aware, adding:

1. **Role-specific welcome screen** -- tells the user what their role is and what they can do
2. **Expanded step content** -- each step shows role-specific bullet points (not generic ones)
3. **New "Your Role" step** -- explains the role hierarchy and where they sit
4. **New "Kru Glitch AI" step** -- explains what the AI can do for their specific role
5. **New guest steps** -- Stay Support (maintenance/laundry), Payments, Reviews, and AI
6. **Role-specific step filtering** -- Maintenance sees only their relevant steps, Viewer sees read-only context, etc.

## Architecture

### Step Definitions (per role variant)

Instead of one flat `STAFF_STEPS` array, we define **role-specific step sets** that include contextual bullet points directly in the step data rather than relying solely on i18n keys. The `TutorialOverlay` component will select steps based on role.

**Staff roles get these step groups:**

| Role | Steps Shown |
|------|------------|
| Admin | Your Role, Dashboard, Units, Bookings, Calendar, Pricing, Reports, Messages, Embeds, Settings, Kru Glitch AI |
| Manager | Your Role, Dashboard, Units, Bookings, Calendar, Pricing, Reports, Messages, Embeds, Settings, Kru Glitch AI |
| Supervisor | Your Role, Dashboard, Bookings, Calendar, Messages, Kru Glitch AI |
| Front Desk | Your Role, Dashboard, Bookings, Calendar, Messages, Kru Glitch AI |
| Maintenance | Your Role, Dashboard (Queue), Calendar, Kru Glitch AI |
| Viewer | Your Role, Dashboard, Bookings, Calendar, Reports |

**Guest gets:**
Your Role, My Bookings, Messages, Documents, Stay Support, Payments, Reviews, Profile, Kru Glitch AI

### Role-Specific Bullet Points

Each step will have **role-keyed i18n entries** so the same page (e.g., Dashboard) shows different content per role:

- **Admin Dashboard**: "Monitor all queues, approve bookings, manage staff alerts"
- **Front Desk Dashboard**: "Track today's arrivals/departures, respond to inquiries"
- **Maintenance Dashboard**: "View your maintenance queue and laundry requests"

The i18n key pattern: `tutorial.{step}.{role}.point1` with fallback to `tutorial.{step}.point1` for generic content.

### New Steps Content

**"Your Role" step** (shown first after welcome):
- Admin: "You have full control over the property: users, policies, units, pricing, and system configuration."
- Manager: "You oversee operations: approve bookings, manage units/pricing, and view revenue reports."
- Supervisor: "You handle check-ins/check-outs, record deposits, and have read-only queue visibility."
- Front Desk: "You manage day-to-day operations: bookings, messages, and guest coordination."
- Maintenance: "You handle room maintenance requests and can view the calendar for scheduling."
- Viewer: "You have read-only access to bookings, calendar, and reports."
- Guest: "You can manage your bookings, message staff, upload documents, and get support during your stay."

**"Kru Glitch AI" step:**
- Admin: "Ask about system health, webhook status, failed payments, and policy configuration."
- Manager: "Ask about revenue summaries, occupancy trends, and 30-day payment analytics."
- Supervisor/Front Desk: "Ask about today's arrivals, departures, and 14-day availability."
- Maintenance: "Ask about your prioritized maintenance queue and overdue requests."
- Guest: "Ask about your booking details, pricing quotes, and pre-arrival checklist status."

## Files Modified

1. **`src/components/TutorialOverlay.tsx`** -- Restructure step selection logic to be role-aware; add new step types (role intro, AI); support role-specific i18n key resolution with fallback
2. **`src/i18n/locales/en.json`** -- Add role-specific tutorial content, new steps (yourRole, kruGlitch, staySupport, payments, reviews for guest)
3. **All other locale files** (th, ko, fr, de, es, zh, ja, ru) -- Add the same new tutorial keys with translated content

## Technical Details

### TutorialOverlay Changes

- New constant: `ROLE_STEPS` -- a `Record<AppRole, TutorialStep[]>` mapping each role to its ordered step list
- New step keys: `yourRole`, `kruGlitch`, `guest.staySupport`, `guest.payments`, `guest.reviews`
- New icons: `Shield` for role, `Bot/Sparkles` for AI, `Wrench` for stay support, `CreditCard` for payments, `Star` for reviews
- The `t()` call will attempt `tutorial.{step}.{role}.pointN` first, falling back to `tutorial.{step}.pointN`
- Welcome screen will show the role name badge

### i18n Structure (new pattern)

```
tutorial.yourRole.admin.title = "Your Role: Administrator"
tutorial.yourRole.admin.point1 = "Full control over..."
tutorial.kruGlitch.guest.point1 = "Ask about your booking..."
tutorial.guest.staySupport.title = "Stay Support"
tutorial.guest.staySupport.point1 = "Report room issues..."
```

### No Database Changes

The existing `tutorial_completed` boolean on `profiles` is sufficient. No schema changes needed.

## Sequence

1. Add all new i18n keys to `en.json` (role-specific tutorial content)
2. Refactor `TutorialOverlay.tsx` with role-aware step selection and fallback i18n resolution
3. Translate new keys across all 8 non-English locale files
