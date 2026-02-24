

# Search, Filter, and Custom Amenities for Units

## Overview
Three improvements to the Units page:
1. A search bar to filter units by name or description
2. An active/inactive status filter (All / Active / Inactive)
3. Allow typing custom amenities in the unit form beyond the 14 preset options

## What Changes

### 1. Search Bar and Status Filter (Units Page)
A search input and a three-option toggle (All / Active / Inactive) will be added between the page header and the unit group manager. Typing in the search bar instantly filters units by name or description (case-insensitive). The status filter lets you show all units, only active, or only inactive.

### 2. Custom Amenities (Unit Form Dialog)
Below the existing amenity chips, a text input with an "Add" button lets you type any custom amenity name and add it. The custom amenity appears as a selected chip alongside the preset ones and can be toggled off the same way. Previously-saved custom amenities from existing units also appear as chips when editing.

---

## Technical Details

### File: `src/pages/Units.tsx`

1. **Add state**: `searchQuery` (string) and `statusFilter` ("all" | "active" | "inactive")
2. **Add imports**: `Search` icon from lucide, `Input` component
3. **Add filter UI** between header and group manager: a row with the search `Input` (with Search icon) and three `Button` variants for All/Active/Inactive
4. **Filter logic**: Add a `filteredUnits` memo that filters `units` by search query (matches name or description) and status filter, then feed `filteredUnits` into the existing `grouped` memo instead of raw `units`

### File: `src/components/UnitFormDialog.tsx`

1. **Add state**: `customAmenity` (string) for the input field
2. **Add imports**: `Plus` icon from lucide
3. **Compute combined amenity list**: Merge `AMENITY_OPTIONS` with any amenities already on the unit that aren't in the preset list (so custom ones from DB appear as chips)
4. **Add input row** below the preset amenity chips: an `Input` + "Add" `Button`. On click (or Enter key), trim the value, check it's not a duplicate, add it to `selectedAmenities`, and clear the input
5. **No database changes needed** -- amenities are stored as a text array, so custom strings are already supported

