

# Separate Guest and Staff Authentication Pages

## Overview

Create a dedicated guest-facing login/signup page at `/auth/guest` with warm, hospitality-focused branding, and restrict the existing `/auth` page to staff-only login (no signup option for staff -- accounts are created by admins). Update all embed widgets and routing to point guests to the new page.

## Changes

### 1. New Guest Auth Page (`src/pages/GuestAuth.tsx`)

A new page at `/auth/guest` designed specifically for guests:

- Warm branding: "Welcome to Ground Stay" with guest-oriented copy ("Create your guest account to manage bookings, message our team, and more")
- Defaults to **sign-up mode** (since most guests arriving from embeds are new)
- Toggle to switch to sign-in for returning guests
- After login/signup, redirects to `/guest` (not `/` which would go through RoleRedirect)
- Uses the same `useAuth` hooks and Supabase auth -- just different UI and redirect target
- If already logged in as a guest, redirects to `/guest`; if logged in as staff, redirects to `/dashboard`

### 2. Staff Auth Page Updates (`src/pages/Auth.tsx`)

- Remove signup option entirely -- staff accounts are created by admins via the edge function
- Update copy: "Staff Login" / "Sign in to your staff account"
- After login, redirects to `/dashboard` (not `/`)
- Add a small link at the bottom: "Are you a guest? Sign in here" pointing to `/auth/guest`

### 3. Routing Updates (`src/App.tsx`)

- Add route: `/auth/guest` renders `GuestAuth`
- Keep `/auth` for staff login
- Both are public routes (no `ProtectedRoute` wrapper)

### 4. Embed Updates (`src/pages/EmbedWidget.tsx` + `src/components/EmbedCodeGenerator.tsx`)

- Change the registration link from `/auth?register=true` to `/auth/guest`
- Update the `EmbedCodeGenerator` so the "Guest Portal Registration" CTA target points to `/auth/guest`
- Update the button label detection in all embed widget types

### 5. RoleRedirect Update (`src/components/RoleRedirect.tsx`)

- No changes needed -- it already routes guests to `/guest` and staff to `/dashboard`

### 6. Translation Keys (`src/i18n/locales/en.json`)

Add keys for the new guest auth page and update staff auth copy.

---

## Technical Details

### File Summary

| File | Action |
|------|--------|
| `src/pages/GuestAuth.tsx` | **Create** -- dedicated guest login/signup page |
| `src/pages/Auth.tsx` | **Modify** -- staff-only login, no signup, add link to guest auth |
| `src/App.tsx` | **Modify** -- add `/auth/guest` route |
| `src/pages/EmbedWidget.tsx` | **Modify** -- update registration URL from `/auth?register=true` to `/auth/guest` |
| `src/components/EmbedCodeGenerator.tsx` | **Modify** -- update registration URL |
| `src/i18n/locales/en.json` | **Modify** -- add guest auth translation keys |

### Guest Auth Page Design

- Same card-based layout as current Auth page
- Header: "Ground Stay" in Playfair Display
- Subheading: "Your guest portal" or "Welcome, guest"
- Default mode: Sign Up (name, email, password)
- Toggle: "Already have an account? Sign in"
- After successful signup: shows email verification toast
- After successful login: `Navigate` to `/guest`
- Language selector in top-right corner (same as current)

### Staff Auth Page Changes

- Title stays "Ground Stay"
- Subheading: "Staff Portal"
- Only sign-in form (email + password, no full name field)
- No signup toggle/button
- Small text at bottom: "Are you a guest? Sign in here" linking to `/auth/guest`
- After login: `Navigate` to `/` (RoleRedirect handles routing)

### Embed URL Change

All embed widget types currently check `contactUrl.includes("/auth?register=true")` to decide between "Book Now" and "Check Availability" labels. This changes to check for `/auth/guest` instead.

