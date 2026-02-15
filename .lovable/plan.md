

# Muay Thai Aesthetic and Animation Overhaul for Ground Stay

## The Vision

Ground Stay serves a competitive Muay Thai gym. Right now the UI is functional but static -- warm hospitality tones with zero motion. This plan injects the energy of a fight camp into the experience while keeping the operational clarity intact. Think: disciplined power, not flashy chaos.

---

## Design Language: "Camp Ready"

### Color Accent Additions

Keep the existing warm earth palette as the base (it works for hospitality), but introduce a **fight accent system** layered on top:

| Token | Value | Usage |
|-------|-------|-------|
| `--fight-red` | Deep crimson red | State transitions, urgent badges, CTA pulses |
| `--fight-gold` | Championship gold | Success states, achievement moments, stat highlights |
| `--fight-dark` | Near-black charcoal | Hero sections, auth backgrounds |

These supplement -- not replace -- the existing design tokens.

### Typography Accent

Add a display-weight condensed font (like **Oswald** or **Barlow Condensed**) for stat numbers, page headers on the dashboard, and hero text on auth screens. The existing Playfair Display stays for section headers, Source Sans 3 for body text.

---

## Phase 1: Page Transition System

### What Changes
Wrap the router's page content in an animated container so navigating between pages feels like movement, not teleportation.

- Use CSS `@keyframes` with a fade-up-in effect (opacity 0 to 1, translateY 12px to 0)
- Each page's root `<div>` gets `animate-fade-in` on mount
- Duration: 300ms ease-out (fast enough to not feel sluggish)
- No external animation library needed -- pure CSS + Tailwind keyframes

### Files Modified
- `tailwind.config.ts` -- add new keyframes and animation utilities
- `src/index.css` -- add new utility classes
- `src/components/DashboardLayout.tsx` -- animate `<main>` children
- `src/components/GuestLayout.tsx` -- same pattern

---

## Phase 2: Auth Screens -- "Enter the Camp"

### Staff Login (`/auth`)
- Dark gradient background (charcoal to deep warm brown) instead of plain `bg-background`
- Subtle animated background pattern: faint diagonal lines or a very low-opacity repeating Thai boxing ring rope pattern using CSS gradients
- "Ground Stay" title scales in on load with a slight bounce
- Login card fades up from below
- A subtle tagline below the title: gym-focused energy (e.g., "Train. Stay. Compete.")

### Guest Auth (`/auth/guest`)
- Same dark hero treatment but warmer (more terracotta undertones)
- Sign-up card slides in from right on initial load
- Toggle between Login/Register has a smooth crossfade instead of instant swap
- Optional: a faint silhouette or SVG of a Muay Thai stance as a watermark behind the card (CSS background, not an image dependency)

### Files Modified
- `src/pages/Auth.tsx`
- `src/pages/GuestAuth.tsx`
- `src/index.css` -- new background pattern classes

---

## Phase 3: Dashboard -- "The War Room"

### Stat Cards
- Numbers count up from 0 to their value on first render (a simple counter animation using requestAnimationFrame)
- Cards stagger their entrance: first card fades in at 0ms, second at 100ms, third at 200ms, fourth at 300ms
- On hover, cards lift slightly with a shadow increase (already partially done with `hover-scale`, but refine to include shadow elevation)

### Approval Queue
- Pending approval items pulse gently with a soft border glow (using `animate-pulse` variant with a ring color)
- Approve/Reject buttons have micro-animations: approve grows slightly on hover (scale 1.05), reject shakes subtly

### Quick Action Links
- Arrow icon slides right on hover (translateX transition)
- Icon background has a subtle color shift on hover

### Recent Activity Timeline
- Timeline dots pulse once on initial render
- Each activity item staggers in with a 50ms delay

### Files Modified
- `src/pages/Index.tsx` -- add animation classes and counter logic
- New utility: `src/hooks/useCountUp.ts` -- animated number hook

---

## Phase 4: Sidebar -- "Corner Team"

### Current State
Plain dark sidebar with text links and badges.

### Enhancements
- Active nav item gets a left border accent (3px solid primary) with a slide-in transition
- Nav items have a subtle translateX hover (shift 4px right)
- Badge counts use a brief scale-bounce animation when their value changes
- "Ground Stay" logo area: add a very subtle CSS-only Muay Thai glove icon or a small decorative element (using a before/after pseudo-element or a tiny inline SVG)
- Sidebar open/close transition is already handled by shadcn -- just ensure it's smooth

### Files Modified
- `src/components/AppSidebar.tsx` -- add hover/active transitions
- `src/components/NavLink.tsx` -- active state animation
- `src/index.css` -- sidebar animation utilities

---

## Phase 5: Cards and Interactive Elements -- "Fight-Ready"

### Global Card Enhancements
- All cards get a subtle `hover:shadow-md` with `transition-shadow duration-200`
- Booking cards in the mobile list view: swipe-hint animation on first visit (a tiny horizontal wiggle to suggest interactivity)
- Selected/active cards get a left accent border that animates in

### Buttons
- Primary buttons: on hover, a subtle inner glow effect (box-shadow inset)
- Destructive buttons: slight shake on hover (a 2-frame wiggle keyframe)
- Ghost buttons: underline slides in from left on hover (like the existing `.story-link` pattern)

### Badges / State Indicators
- Booking state badges: when state changes, the new badge scales in (scale 0.8 to 1.0 with opacity)
- "Expired" badges pulse with a red glow

### Tables
- Table rows fade in with staggered delays on initial load
- Hover state: row background transitions smoothly

### Files Modified
- `src/index.css` -- global card and button animation utilities
- `tailwind.config.ts` -- additional keyframes
- `src/components/ui/card.tsx` -- add default hover shadow transition
- `src/components/ui/button.tsx` -- add hover micro-interactions via CSS

---

## Phase 6: Guest Portal -- "Fighter's Lounge"

### Header
- "Ground Stay" text has a subtle letter-spacing animation on load (tracking widens slightly)
- Tab switches have a smooth indicator slide (the active tab underline glides left/right instead of jumping)

### Booking Cards
- Guest booking cards stagger in when the tab loads
- State badge has a subtle entrance animation
- Cancel button has a confirmation shake pattern

### Listings Tab
- Unit cards animate in with a grid-reveal pattern (staggered from top-left to bottom-right)
- Unit photos have a Ken Burns effect on hover (very slight zoom + pan, 5s duration)
- "Book Now" button has a pulse ring animation to draw attention

### Messages Tab
- New messages slide in from the bottom
- Thread selection: selected thread card gets a left accent border that slides in
- Translate button has a globe spin on hover

### Stay Support Tab
- Maintenance request cards have a priority-based color pulse (urgent = red pulse)

### Files Modified
- `src/pages/GuestPortal.tsx` -- stagger and entrance animations
- `src/components/GuestLayout.tsx` -- header animations

---

## Phase 7: Muay Thai Decorative Elements

### CSS-Only Decorative Patterns
No image files needed -- all done with CSS:

- **Ring rope pattern**: Thin horizontal lines (2px) at the very top of the dashboard area, using repeating-linear-gradient. Subtle, barely visible, but adds texture.
- **Corner accent**: On auth pages, a diagonal stripe pattern in the top-right corner using CSS gradients (red and gold stripes, low opacity).
- **Section dividers**: Instead of plain `<Separator>`, key sections use a styled divider with a tiny diamond shape in the center (CSS pseudo-elements).

### Micro-Illustrations (CSS/SVG inline)
- A small inline SVG of boxing gloves icon next to "Ground Stay" in the sidebar
- Optional: A Thai flag color accent stripe (red-white-blue-white-red) as a 4px decorative bar above the main content area on the dashboard

### Files Modified
- `src/index.css` -- decorative CSS classes
- `src/components/AppSidebar.tsx` -- glove icon
- `src/components/DashboardLayout.tsx` -- decorative bar

---

## Phase 8: Loading and Empty States

### Skeleton Enhancements
- Skeletons pulse with a warm shimmer (gradient sweep from warm-gray to warm-white) instead of the default gray pulse

### Empty States
- "No bookings" empty state: add a subtle illustrated icon (using Lucide icons composed together) with a fade-in animation
- Loading spinner: replace generic spinner with a CSS-animated circular motion (like a roundhouse kick arc -- a quarter-circle that rotates)

### Toast Notifications
- Success toasts slide in with the fight-gold accent
- Error toasts shake briefly on entry

### Files Modified
- `src/index.css` -- custom shimmer animation
- `src/components/ui/skeleton.tsx` -- warm shimmer class
- `src/components/ui/sonner.tsx` -- toast entrance tweaks

---

## Phase 9: Notification Bell and AI Panel Polish

### Notification Dropdown
- Unread count badge bounces on update
- Notification items slide in from right when dropdown opens
- Mark-as-read: item fades to muted smoothly

### AI Assistant Panel
- Panel slides up from bottom with a spring-like easing
- Messages appear with a typing-indicator style fade
- Mode selector tabs have the same smooth indicator slide as the guest portal tabs

### Files Modified
- `src/components/NotificationBell.tsx` -- entrance animations
- `src/components/AIAssistantPanel.tsx` -- panel and message animations

---

## Technical Implementation Summary

### New Tailwind Keyframes to Add
```
fade-in, fade-up, scale-in, slide-up, slide-right,
stagger-in, count-up, pulse-glow, shake-subtle,
shimmer-warm, bounce-badge, ken-burns
```

### New CSS Utility Classes
```
.animate-stagger-1 through .animate-stagger-8
.hover-lift (translateY + shadow)
.hover-slide-right (translateX)
.ring-rope-pattern
.corner-accent
.fight-divider
.warm-shimmer
```

### New Hook
- `src/hooks/useCountUp.ts` -- takes a target number, returns the current animated value (for dashboard stat cards)

### Files Created
| File | Purpose |
|------|---------|
| `src/hooks/useCountUp.ts` | Animated number counter hook |

### Files Modified (Summary)
| File | Changes |
|------|---------|
| `tailwind.config.ts` | New keyframes, animations, font family |
| `src/index.css` | New utility classes, patterns, decorative elements, fonts |
| `src/pages/Auth.tsx` | Dark hero background, entrance animations |
| `src/pages/GuestAuth.tsx` | Dark hero background, form transitions |
| `src/pages/Index.tsx` | Stat counter animation, staggered cards, timeline animation |
| `src/pages/GuestPortal.tsx` | Tab transitions, card stagger, Ken Burns on photos |
| `src/components/DashboardLayout.tsx` | Page transition wrapper, decorative bar |
| `src/components/GuestLayout.tsx` | Header animation, page transitions |
| `src/components/AppSidebar.tsx` | Nav hover effects, glove icon, active state |
| `src/components/NavLink.tsx` | Active border animation |
| `src/components/NotificationBell.tsx` | Badge bounce, dropdown animations |
| `src/components/AIAssistantPanel.tsx` | Panel slide, message fade |
| `src/components/ui/card.tsx` | Default hover shadow transition |
| `src/components/ui/button.tsx` | Hover micro-interactions |
| `src/components/ui/skeleton.tsx` | Warm shimmer effect |

### Dependencies
- One Google Font addition: **Oswald** (or Barlow Condensed) for display numbers -- added via the existing `@import url()` in `index.css`
- No animation libraries (no Framer Motion, no GSAP) -- everything is CSS keyframes + Tailwind utilities + one small React hook

### Performance Notes
- All animations use `transform` and `opacity` only (GPU-accelerated, no layout thrashing)
- `prefers-reduced-motion` media query will disable all animations for accessibility
- Stagger delays use CSS `animation-delay`, not JavaScript timeouts
- Ken Burns effect only activates on hover (no idle GPU cost)

