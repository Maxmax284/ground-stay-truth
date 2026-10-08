# WhatsApp Bridge (Twilio): WhatsApp-only setup, SMS left dormant

## What the review found (read-only)

- **Settings card** (`src/components/MessagingBridgeSettings.tsx`, about lines 332–408): the title says "SMS + WhatsApp Bridge (Twilio)". It shows four fields: Account SID, Auth Token, **SMS From Number**, and WhatsApp From Number. The help text says "How to get your Twilio SMS credentials", tells staff to buy an SMS-capable number, and to "paste all three". It lists the SMS webhook URL first and ends with an SMS Pumping warning.
- **SMS From Number is not required by the code that saves settings.** Each field saves on its own. The `TWILIO_KEYS` constant (line 29) includes `twilio_sms_from` but nothing uses it. The confusion comes only from the help text and labels.
- **WhatsApp never uses `twilio_sms_from`:**
  - `notify-via-messaging`: Twilio WhatsApp is used only when `twilio_bridge_enabled` is on and `twilio_whatsapp_from` is saved. Otherwise it falls back to the Meta sender. `sendTwilioWhatsApp` reads SID, token and the WhatsApp sender only.
  - `messaging-system-ping` and `messaging-ping-all`: the WhatsApp branch checks SID, token and WhatsApp sender only.
  - `twilio-webhook`: checks the signature (HMAC-SHA1 with the Auth Token) for both `?channel=sms` and `?channel=whatsapp`. The SMS number plays no part.
- **Only SMS code reads `twilio_sms_from`:** `sendTwilioSms` in `notify-via-messaging`, plus the `channel === "sms"` branches of both ping functions. These run only for chat links whose channel is `sms`. With the field empty they return a clean "twilio_sms_from not configured" result (`not_configured`), so nothing crashes.
- `manage-integration-secret` and `useIntegrationSecrets.ts` keep `twilio_sms_from` on the list of allowed keys. That is harmless.

## Proposed change (one file, wording and layout only)

`src/components/MessagingBridgeSettings.tsx` only:

1. Title becomes **WhatsApp Bridge (Twilio)**. Description: "Inbound WhatsApp routed through Kru Glitch (capture-only). Use this instead of the Meta wizard if you don't have Meta access."
2. Remove the **SMS From Number** field from the card. The saved value, if there is one, stays in storage untouched.
3. Remove `twilio_sms_from` from the unused `TWILIO_KEYS` constant.
4. Rewrite the help steps so they are WhatsApp-only:
   - copy Account SID and Auth Token
   - **Sandbox (testing):** From = +1 415 523 8886. Each tester first texts `join <code>`. Only joined phones receive messages, and sandbox sessions expire.
   - **Production:** From = a WhatsApp sender registered and approved in Twilio (Messaging → Senders → WhatsApp senders), tied to a verified Meta business.
5. Add a highlighted notice: "A number running the WhatsApp Business phone app is **not** automatically a Twilio WhatsApp sender. Registering that number with Twilio moves it to the Cloud API and can cut off the phone app. Don't register the camp's live phone-app number until we've planned that move. A separate number is the safe route."
6. Webhook box: show only the WhatsApp URL (`/twilio-webhook?channel=whatsapp`, POST, signature checked). Take out the SMS URL and the SMS Pumping and SMS Geo Permissions warning. Replace that warning with a note to watch WhatsApp conversation costs in Twilio.

## Explicitly NOT changed (SMS left dormant)

- No changes to any server functions, so nothing gets deployed. `sendTwilioSms`, the SMS ping branches and `?channel=sms` handling stay as they are and simply sit unused.
- No changes to stored data. The `twilio_sms_from` secret, the allowed-key lists, the `twilio_bridge_enabled` toggle, Meta wizard, Telegram and LINE all stay as they are.
- Booking and guest messaging stay the same, including the rule that Twilio WhatsApp is used only when the toggle is on and a WhatsApp sender is saved, with Meta as the fallback.
- Bringing SMS back later means adding the field back to the card. No server work needed.

## Risks

- Anyone who already has `sms` chat links (if there are any) will keep getting `not_configured` results in the delivery log until SMS is set up. That is already true today. I'll check the count before building. This is a read-only lookup on `messaging_chat_bindings` where channel = sms.
- If an admin saved an SMS number earlier, it can no longer be seen or deleted from this card. It stays dormant and doesn't affect anything.
- This change can't touch the Meta phone-app migration risk. That stays in staff hands, and the notice exists to flag it.

## Verification after approval

1. Build log clean.
2. Open Settings → Integrations as admin with Playwright and take a screenshot. Check: new title, three fields, sandbox/production text, the phone-app notice, a single WhatsApp webhook URL.
3. Search the code to confirm no SMS wording is left on the card and that nothing else imports `TWILIO_KEYS`.
4. Confirm no server-function files changed, so nothing needs deploying.
5. No messages sent, no settings saved.
