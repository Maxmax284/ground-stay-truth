

# Embed Builder -- Dedicated Page with Full Customization

## Overview

Move the embed widget builder out of the Settings tab and into its own dedicated sidebar page at `/embeds`. This new page will have a two-panel layout: a configuration panel on the left with all customization controls, and a live preview on the right that updates in real-time. The builder will let you toggle every visible component on/off and control the look and feel of the widget before copying the embed code.

## What Changes

### 1. New sidebar item: "Embeds"
- Add a new nav entry between Messages and Settings in the sidebar using a `Code2` icon
- Gated to `manager` and `admin` roles (same as `canManageUnits`)
- Remove the "Embeds" tab from the Settings page since it moves to its own route

### 2. New page: `/embeds` (src/pages/Embeds.tsx)
- Two-column layout: left panel for controls, right panel for live preview
- On mobile: stacks vertically (controls on top, preview below)

### 3. Enhanced Configuration Controls

**Unit and Widget Type Selection** (existing, carried over):
- Unit selector (active units only)
- Widget type selector (Listing, Compact, Calendar, CTA) with badge chips

**New -- Component Visibility Toggles**:
- Show/hide photo
- Show/hide description
- Show/hide amenities list
- Show/hide capacity badge
- Show/hide minimum nights badge
- Show/hide cleaning fee
- Show/hide availability calendar (for Listing type)
- Show/hide CTA button

**New -- Style Customization**:
- Accent color picker (hex input + color swatch) -- controls button color, title accent
- Border radius slider (0-24px) -- controls card corner rounding
- Font size selector (Small / Medium / Large)
- Dark mode toggle for the widget background (light card vs dark card)
- Card shadow selector (None / Subtle / Medium / Strong)
- Max width input (px) -- controls the iframe/card max-width

**CTA Configuration** (existing, carried over):
- CTA target: Contact URL vs Guest Registration
- Contact URL input field
- CTA button text override (new -- custom label instead of auto "Book Now" / "Check Availability")

### 4. Updated Embed URL Parameters

The embed widget page (`EmbedWidget.tsx`) will be updated to read new query parameters that control visibility and styling:

- `hide=photo,amenities,calendar` -- comma-separated list of hidden components
- `accent=#9a5a30` -- accent color (existing)
- `radius=12` -- border radius
- `font=md` -- font size (sm/md/lg)
- `dark=1` -- dark mode
- `shadow=subtle` -- shadow level
- `max_w=480` -- max width
- `cta_label=Book+Now` -- custom CTA text

### 5. Updated EmbedWidget.tsx

Each sub-component (FullListing, CompactCard, CalendarOnly, CTAOnly) will read the new parameters and conditionally render components. The inline styles will be updated to respect the customization values.

### 6. Permissions and Routing

- Add `/embeds` to `NAV_ACCESS` in permissions.ts for `manager` and `admin`
- Add route in App.tsx with ProtectedRoute
- Remove the embeds TabsContent from Settings.tsx

## Technical Details

### Files to create:
- `src/pages/Embeds.tsx` -- new page with the two-panel builder UI

### Files to modify:
- `src/components/AppSidebar.tsx` -- add "Embeds" nav item with Code2 icon
- `src/lib/permissions.ts` -- add `/embeds` route access for manager + admin
- `src/App.tsx` -- add `/embeds` route
- `src/pages/Settings.tsx` -- remove the embeds tab
- `src/pages/EmbedWidget.tsx` -- read new query params, apply visibility/style overrides
- `src/components/EmbedCodeGenerator.tsx` -- refactor into the new full-page builder with toggle/style controls
- i18n files (en.json at minimum) -- add new translation keys for the toggle labels and style options

### Embed URL example with full customization:
```
/embed/listing/unit-id-123?accent=%239a5a30&hide=amenities,cleaning_fee&radius=16&font=lg&shadow=medium&dark=0&cta_label=Reserve+Now&contact_url=https://example.com
```

### Preview panel behavior:
- Uses an actual iframe pointed at the embed URL with all current parameters
- Updates live as you change any toggle or style value
- Shows the generated iframe code snippet below the preview with a copy button
- Shows the direct URL with a "open in new tab" button

