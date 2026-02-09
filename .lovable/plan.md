
# Fix: Sidebar Not Visible on Narrow Viewports

## What's Happening

The sidebar is actually there -- it's working correctly. The Lovable preview panel is narrower than 768 pixels, which triggers the **mobile layout**. In mobile layout, the sidebar converts from a permanent side panel into a slide-out drawer that's closed by default. The only way to open it is the small hamburger icon (three lines) in the top-left header bar.

The icon is there, but it's small and easy to miss.

## The Fix

Make the header bar more useful so the sidebar trigger is obvious and the current page context is always clear, even when the sidebar is hidden:

1. **Enlarge and label the sidebar trigger** -- add "Menu" text next to the hamburger icon so it's unmistakable
2. **Show the current page title** in the header bar so you always know where you are, even without the sidebar open
3. **Add the "Ground Stay" branding** to the header on mobile so the app identity is always visible

## What Changes

**File: `src/components/DashboardLayout.tsx`**
- Update the header to show "Ground Stay" branding on mobile
- Display the current page name (Dashboard, Bookings, Settings, etc.) derived from the current route
- Make the SidebarTrigger button larger with a visible label

This is a single-file change. No database or backend changes needed.

## Technical Details

- Use `useLocation()` from react-router-dom to read the current path and map it to a page title
- Add responsive classes so the branding shows on small screens but stays hidden on desktop (where the sidebar already shows it)
- Increase the SidebarTrigger touch target size for mobile usability
