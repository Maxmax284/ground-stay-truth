## Goal
Make downloading media dead simple: one click for a single photo, one click for everything selected, and a "Download all" that grabs the whole library (or just the photos actually in use).

## What gets added

**1. Per-photo download button**
In the hover toolbar on each tile (next to Preview / Edit / Copy URL), add a download icon. Saves the original file with a clean filename (original filename, falling back to the storage path name).

**2. Bulk download in the selection bar**
When photos are selected, the action bar gets a `Download (N)` button. Fetches each file and packages them into a single ZIP, organized into folders matching the media library folders (`Exterior/`, `Interior/`, `Uncategorized/`, etc.). Shows progress ("12 of 40…") and a toast when done.

**3. "Download all" dropdown in the header**
Always visible next to Upload, no selection needed:
- **Everything** — full library as one ZIP
- **Only photos in use** — just the assets currently assigned to a unit (uses the existing usage map already computed on the page)
- **Current view** — whatever the folder/search/sort filters are showing

**4. Lightbox download**
Add a download button to the preview lightbox too, so you can eyeball then grab.

## Technical notes
- Add `jszip` for client-side zipping; files are fetched from the public `unit-photos` bucket URLs already used for display, so no new backend or edge function.
- Single-file download uses a blob fetch + object URL (same resilient pattern as the booking-confirmation PDF download) rather than a raw `<a href>`, so it works in PWA/in-app browsers instead of just navigating away.
- Downloads run in small batches (~5 concurrent) with a progress counter so a 100-photo ZIP doesn't stall the tab silently. Very large sets (>200 files) prompt a confirm first.
- Filename collisions inside a ZIP get a numeric suffix.
- No schema changes, no RLS changes, no changes to upload/delete/assign logic.

## Out of scope
Zipping server-side, downloading guest ID documents (that stays in the audited private-bucket flow), and any change to how photos are stored.
