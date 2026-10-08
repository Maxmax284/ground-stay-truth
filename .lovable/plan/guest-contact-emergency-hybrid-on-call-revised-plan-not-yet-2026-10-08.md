# Guest Contact & Emergency + Hybrid On-Call (revised plan, not yet built)

## Hard boundaries (unchanged)
- Nikki's WhatsApp Business account, number and phone/call setup: no migration, disconnect, redirect or change. This is contact configuration and screen work only, not a WhatsApp API integration.
- Nobody is assigned automatically. Default On-Call and roster shifts exist only when a manager/admin saves them.
- Automatic escalation stays OFF until management approves staffing and the practice-camp rehearsal passes.
- WhatsApp, phone calls and CampStay urgent requests are three separate channels. Opening WhatsApp or tapping Call never creates an incident or notifies the roster.

## 1. Settings → App → "Guest Contact & Emergency"
Rename the existing "Guest urgent help" card and move it to the top of the App tab (managers + admins only, as today).

Top of section, two separate, independently editable fields:
1. **Official WhatsApp Business Number** (international format)
   - Normalize on save (strip spaces/dashes, require leading `+` and country code, 8–15 digits); inline error if invalid.
   - Shows the generated `https://wa.me/<digits>` link read-only, plus **Preview WhatsApp** (opens in new tab) and **Copy link**.
   - Admin never types a URL.
2. **Urgent Assistance Call Number**
   - Same normalization; shows the `tel:` result and a **Test dial** link (opens dialer only; never claims the line was tested).
   - May match the WhatsApp number but is stored separately.

Below: staffed hours, after-hours notice, "Allow guests to send urgent requests" switch (unchanged).

Short management note: "WhatsApp messages, ordinary phone calls and CampStay urgent requests are separate. Only urgent requests are tracked and escalated in CampStay; WhatsApp and calls go straight to whoever holds that phone."

Storage: reuse `whatsapp_display_number` and `urgent_call_number` via existing `set_assistance_setting` — no new phone records. Existing values, permissions and settings audit history preserved. Existing non-normalized values are displayed as-is and only normalized when a manager re-saves.

## 2. Reflect everywhere automatically
- **Guest portal Need Help card**: WhatsApp button opens the business chat (`wa.me`), Call camp opens the dialer (`tel:`); both use the same shared formatter as Settings. Urgent request button stays visually distinct with its own wording. Emergency 1669/191 line unchanged.
- **Front Desk → Coverage & Escalation panel**: new read-only "Guest contact" strip showing current WhatsApp number + generated link (copy), active urgent call number, and "Edit in Settings" (deep link to `/settings?tab=app`) for managers/admins only. Front desk sees values, cannot edit.

## 3. Hybrid escalation (retained)
- Optional **Default On-Call** primary + backup, chosen by management from approved responders (can be notified). Blank by default.
- Routing order when an urgent request arrives: active approved Duty Roster shift → Default On-Call → managers/admins (coverage gap).
- Set in the Duty Roster page and summarized in the Front Desk panel; every change logged.

## 4. Verification & documented limits
- Confirm cron job schedule from the database (currently every 5 minutes) and show it in the panel: "Checked every 5 minutes; alerts can arrive up to ~5 minutes after a threshold."
- Panel note on delivery limits: email/push sent is not the same as someone available; push requires each phone to enable Ops Alerts; 0 alerts have been delivered so far, so delivery is unproven until rehearsal.
- Regression checks: guest card still shows existing numbers; Stay Essentials emergency contact untouched; front desk cannot edit; invalid numbers rejected; WhatsApp/Call taps create no incident rows.

## Technical details
- New `src/lib/contactLinks.ts`: `normalizeIntlPhone`, `toWaLink`, `toTelLink` (+ unit tests), used by Settings card, UrgentHelpCard, CoveragePanel.
- Rename/rework `AssistanceSettingsCard.tsx`; reorder in `Settings.tsx`.
- Default On-Call: two new keys through `set_assistance_setting` (`default_oncall_primary`, `default_oncall_backup`), server-validated against `responder_capabilities`; `run_urgent_escalations` reads them after the roster lookup. One small migration; escalation switch untouched.

## Open decisions for management
- Who (if anyone) is Default On-Call primary/backup.
- Whether the call number should equal the WhatsApp number.
