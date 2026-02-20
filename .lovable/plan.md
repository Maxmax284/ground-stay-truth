

# Add Structured Camp Info Content

## What We're Doing

Converting the single `camp_info` policy setting from a plain text string into a structured JSON object with four distinct sections: **Training Schedule**, **What to Bring**, **Gym Rules**, and **Airport Directions**. Then updating both the public `/stay` page and the Guest Portal "Camp Info" tab to render these sections properly using accordions.

## Changes

### 1. Update the `camp_info` policy setting value (database)

Replace the current flat text value with structured JSON:

```json
{
  "training_schedule": "Monday-Saturday\n- Morning: 7:00-9:00 AM (technique + sparring)\n- Afternoon: 4:00-6:00 PM (pads + conditioning)\n- Sunday: Rest day (optional yoga 8:00 AM)",
  "what_to_bring": "- Hand wraps (available at gym shop)\n- Boxing gloves (16oz for training, 10-12oz for sparring)\n- Mouthguard\n- Shin guards\n- Lightweight training clothes\n- Water bottle (refill stations on site)\n- Towel for training",
  "gym_rules": "- Respect all trainers and training partners\n- No shoes on the gym floor\n- Wai (bow) when entering and leaving the ring\n- Keep equipment clean and return after use\n- No training under the influence of alcohol\n- Quiet hours: 10:00 PM - 6:00 AM in accommodation areas",
  "airport_directions": "Koh Samui Airport (USM)\n- 25 minutes by taxi to Lamai\n- Arrange pickup through the front desk (recommended)\n- Taxi fare approximately 500-700 THB\n- Landmark: Located behind Lamai Walking Street, 2 minutes from the beach"
}
```

### 2. Guest Portal - Camp Info Tab (`src/pages/GuestPortal.tsx`)

Update the Camp Info tab (around line 411-420) to parse the structured JSON and render each section in an accordion:

- Parse the `camp_info` value as JSON (with fallback to plain text for backwards compatibility)
- Display four collapsible accordion sections with icons:
  - Clock icon + "Training Schedule"
  - Backpack/list icon + "What to Bring"
  - Shield icon + "Gym Rules"
  - MapPin icon + "Airport Directions"
- Each section shows its content with `whitespace-pre-wrap` formatting
- If the value is still plain text (not JSON), fall back to the current flat display

### 3. Public `/stay` Page (`src/pages/Stay.tsx`)

Update the "About the Camp" section (around line 230-243) to:

- Parse the structured JSON from `camp_info`
- Show a summary grid with the four section titles and a brief preview (first line of each)
- Keep the "Sign up to learn more" CTA
- Backwards-compatible: if value is plain text, show it as-is (current behavior)

### 4. Translation Keys

Add new i18n keys to `en.json` (and propagate to other locale files):

- `campInfo.trainingSchedule`: "Training Schedule"
- `campInfo.whatToBring`: "What to Bring"
- `campInfo.gymRules`: "Gym Rules"
- `campInfo.airportDirections`: "Airport Directions"

## Technical Details

- The `camp_info` value in `policy_settings` stays as a single `jsonb` column -- we just change its shape from a quoted string to a JSON object
- No schema migration needed -- the `value` column is already `jsonb`
- Parsing logic will use `typeof value === 'object'` to detect structured vs. legacy flat text
- The Accordion component from `@radix-ui/react-accordion` is already installed and available at `src/components/ui/accordion.tsx`
- The AI assistant (Kru) in "camp" mode already pulls `camp_info` from policy settings, so it will automatically benefit from the richer structured data without code changes

## Files Modified

| File | Change |
|---|---|
| Database (`policy_settings`) | Update `camp_info` value to structured JSON |
| `src/pages/GuestPortal.tsx` | Render structured camp info with accordions |
| `src/pages/Stay.tsx` | Render structured camp info summary grid |
| `src/i18n/locales/en.json` | Add `campInfo.*` translation keys |
| `src/i18n/locales/*.json` | Propagate keys to all 8 other locale files |

