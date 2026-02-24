
# Use Dynamic Currency Symbol on Unit Cards

## Overview
Replace the hardcoded `DollarSign` icon and raw `base_price` number on unit cards with the formatted price from `policy_settings`, using the existing `formatPrice` utility and `usePolicySettings` hook.

## What Changes

The Units page currently shows a dollar sign icon (`DollarSign` from lucide) next to a raw number for each unit's base price. This will be replaced with the actual currency symbol from your policy settings (e.g., Baht, Euro, Pound) so it automatically matches whatever currency you've configured.

Your system already has the currency infrastructure built -- this is just wiring it into the Units page where it was missed.

## Technical Details

### File: `src/pages/Units.tsx`

1. **Add imports**: Import `usePolicySettings` hook and `formatPrice` utility; remove the `DollarSign` icon import (no longer needed).

2. **Add hook call**: Call `usePolicySettings()` inside the component to fetch the currency config.

3. **Replace price display** (line 96): Change from:
   ```
   <DollarSign icon /> {unit.base_price}
   ```
   To:
   ```
   {formatPrice(unit.base_price, policies, { decimals: 0 })}
   ```
   This renders the price with the correct symbol (e.g., "฿1500" or "EUR1500") instead of always showing a dollar icon.

Only one file is modified. No database changes needed -- the `policy_settings` table already stores `currency_symbol` and `currency_code`.
