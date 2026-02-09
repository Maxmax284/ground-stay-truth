

# Fix: Photo Upload Flow + Visual Polish

## Problem 1: "Where do I add photos?"

Currently, the unit form says **"Save the unit first to upload photos"** when creating a new unit. This is confusing -- you have to create the unit, then go back and edit it just to add photos.

**Fix**: Change the flow so the form creates the unit first (behind the scenes if needed), then immediately enables photo uploads -- OR simply make it clearer with a two-step workflow where the form stays open after creation so you can add photos right away.

The simplest approach: When creating a new unit, after clicking "Add Unit", the form saves the unit but **stays open in edit mode** instead of closing. This lets you immediately upload photos. A success message confirms the unit was created, and you can then add photos and click "Save Changes" when done.

## Problem 2: Visual Polish

The leftover `src/App.css` file contains Vite boilerplate styles (max-width constraints, centered text, logo animations) that aren't currently imported but could cause confusion. It should be cleaned up.

Beyond that, no CSS regressions were introduced -- the design system in `index.css` with the warm hospitality theme is intact. The visual "feel" on narrow viewports may seem off simply because cards stack vertically, but that's expected responsive behavior.

## Changes

### File: `src/components/UnitFormDialog.tsx`
- After successfully creating a new unit, **keep the form open** and switch to edit mode (set the saved unit ID so photo upload becomes available)
- Show a toast saying "Unit created -- you can now add photos"
- Only close the form on Cancel or after editing/saving changes
- Remove the "Save the unit first" message since the form will handle this automatically

### File: `src/App.css`
- Remove all the Vite boilerplate CSS (logo spin, `.card`, `.read-the-docs`, `#root` constraints). This file is not imported but cleaning it up avoids future confusion.

## Technical Details

In `UnitFormDialog.tsx`, the `onSubmit` function currently calls `onOpenChange(false)` after creation. The change:
- On **create**: save the unit, get the returned `id`, set `savedUnitId` to enable photo uploads, but do NOT close the dialog. Update the form to edit mode.
- On **edit**: save changes and close the dialog as before.

This is a small, contained change -- no database or backend modifications needed.
