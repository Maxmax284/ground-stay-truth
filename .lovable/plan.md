

# Unit Groups + Photo Uploads

## Overview

Two enhancements to the Units system, both non-breaking additions:

1. **Unit Groups** -- A new `unit_groups` table lets you organize units into named collections (e.g., "Beachfront Villas", "Mountain Cabins"). Every unit optionally belongs to a group. The Units page switches to a grouped view when groups exist, with an expandable/collapsible layout. All existing functionality (bookings, calendar, pricing, embeds) continues to work exactly as-is since they reference individual units by ID.

2. **Photo Uploads** -- A storage bucket for unit images. The unit form gets a photo upload section where you can drag/drop or pick files. Photos are stored in cloud storage and URLs saved to the existing `photos` column on the `units` table. Photos display on unit cards, the guest portal listings, and embed widgets.

---

## What Changes

### Database

- **New table: `unit_groups`**
  - `id` (uuid, PK)
  - `name` (text, required) -- e.g., "Beachfront Villas"
  - `description` (text, optional)
  - `sort_order` (integer, default 0) -- controls display ordering
  - `is_active` (boolean, default true)
  - `created_at`, `updated_at` (timestamps)
  - RLS: Admins can manage, everyone can read active groups

- **New column on `units`**: `group_id` (uuid, nullable, FK to `unit_groups.id`)
  - Units without a group remain standalone -- nothing breaks

- **New storage bucket**: `unit-photos` (public, so images load without auth tokens)
  - RLS policies: Admins can upload/delete; public read access

### UI Changes

**Units Page (`src/pages/Units.tsx`)**
- Add a "Groups" section at the top -- create/edit/delete groups
- Units display grouped under their group header (collapsible sections)
- Ungrouped units appear in an "Other Units" section at the bottom
- Bulk actions: assign multiple units to a group at once

**Unit Form Dialog (`src/components/UnitFormDialog.tsx`)**
- New "Group" dropdown to assign a unit to a group (optional)
- New "Photos" section with file upload area
- Thumbnail grid of uploaded photos with remove buttons
- Drag-and-drop support for image files

**Unit Cards (Units page, Guest Portal, Embed Widget)**
- Show the first photo as a card thumbnail/hero image
- Photo count badge if multiple photos exist

**New file: `src/components/UnitGroupManager.tsx`**
- Small inline form for creating/editing group names
- Displayed at the top of the Units page

**New file: `src/hooks/useUnitGroups.ts`**
- CRUD hooks for the `unit_groups` table (same pattern as `useUnits`)

**Updated: `src/hooks/useUnits.ts`**
- Join `unit_groups(name)` in the query so group name is available

**Updated: `src/pages/GuestPortal.tsx`**
- Listings tab groups units by their group name
- Show first photo on listing cards

**Updated: `src/pages/EmbedWidget.tsx`**
- Show first photo in the listing and compact widget variants

---

## What Does NOT Change

- Bookings, Calendar, Pricing, Reports, State Machine -- all reference `unit_id` directly and are unaffected
- The `get-availability` edge function -- unchanged, still serves individual unit data
- Existing units with no group assigned continue to work normally
- All RLS policies on existing tables remain untouched

---

## Technical Details

### Storage bucket migration SQL

```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('unit-photos', 'unit-photos', true);

CREATE POLICY "Anyone can view unit photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'unit-photos');

CREATE POLICY "Admins can upload unit photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'unit-photos' 
    AND has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete unit photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'unit-photos' 
    AND has_role(auth.uid(), 'admin')
  );
```

### Photo upload flow

1. User picks/drops image files in the unit form
2. On form submit, files upload to `unit-photos/{unit_id}/{filename}` in storage
3. Public URLs are constructed and saved to the `photos` text array on the unit row
4. Thumbnails render from those URLs everywhere units are displayed

### Grouped display logic

```text
+-- Beachfront Villas (group header, collapsible)
|   +-- Villa A (unit card)
|   +-- Villa B (unit card)
|
+-- Mountain Cabins (group header, collapsible)
|   +-- Cabin 1 (unit card)
|
+-- Other Units (ungrouped)
    +-- Studio Downtown (unit card)
```

### Files to create
- `src/hooks/useUnitGroups.ts`
- `src/components/UnitGroupManager.tsx`
- `src/components/UnitPhotoUpload.tsx`

### Files to modify
- `src/hooks/useUnits.ts` -- add group join
- `src/components/UnitFormDialog.tsx` -- add group picker + photo upload
- `src/pages/Units.tsx` -- grouped layout + group management
- `src/pages/GuestPortal.tsx` -- grouped listings + photos
- `src/pages/EmbedWidget.tsx` -- show photos in widgets
- 1 database migration (unit_groups table + group_id column + storage bucket)

