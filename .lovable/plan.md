## What’s actually wrong

The media page is currently filtering the library to files under `library/` only. That hides the older photos already attached to units, even though the database now has media records for them.

Current backend counts:
- `101` media records total
- `53` newer `library/` uploads
- `48` older unit-linked photos
- `48` photo references still attached to existing units

So the backfill happened, but the page UI is accidentally hiding the original unit photos.

## Plan

1. **Fix the media visibility filter**
   - Stop treating `library/` storage listing as the source of truth for every media asset.
   - Keep validating uploaded `library/` files, but do not hide valid older unit-photo paths just because they are outside `library/`.

2. **Normalize old unit photo paths**
   - Ensure both formats work:
     - `library/file.jpg`
     - older unit photo paths / URLs like `/unit-photos/...` or public storage URLs
   - Generate the correct public image URL for each one.

3. **Fix usage detection**
   - Match media assets against `units.photos` by normalized storage path and URL, not only exact public URL.
   - This will correctly show which older photos are already used by which unit.

4. **Make counts honest**
   - Show the actual visible library count based on renderable media records.
   - If records are hidden because files are missing or images fail to load, surface that as a separate warning count instead of blending it into the main total.

5. **Keep originals in place**
   - No moving files.
   - No detaching from units.
   - The same original photos remain where they are and also appear in the Media Library.