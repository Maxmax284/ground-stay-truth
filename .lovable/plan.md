# Wire Lamai's WhatsApp Business into staff replies

Goal: when staff reply to a guest who has a WhatsApp number on file, the message goes straight to their WhatsApp from the camp number. Email only goes out if WhatsApp can't deliver.

## Steps

1. **Link the account.** I open the WhatsApp connect card and you pick Lamai's WhatsApp Business connection, or create it there. Nothing else moves until this is linked.
2. **Test the connection.** I read the connected number (display number, quality rating), then send one test text to your own phone.
3. **Turn on the existing send path.** The send function already tries WhatsApp first. Once the key exists, it sends instead of reporting "not linked". Each send records its WhatsApp message id on the message, so staff can see it went out.
4. **Handle the 24-hour rule.**
   - The guest messaged within the last 24 hours: the reply goes out as a normal WhatsApp text.
   - Outside that window: WhatsApp needs an approved template. Until Meta approves one, the reply falls back to email, and staff see a "Sent by email — WhatsApp window closed" note on the message.
   - I draft one utility template for Meta to review ("You have a new message from Lamai Camp — open your portal: {{1}}"). Approval can take up to 48 hours. After that, messages outside the window use the template.
5. **Stop the double email.** If WhatsApp confirms the send, the guest gets no email. If WhatsApp fails, the email goes out as it does today. Admin heads-up alerts don't change.
6. **Show staff what happened.** In the thread, each staff reply shows a small "via WhatsApp" or "via email" tag.

## Honest limit: messages coming in

This project's setup can't receive WhatsApp messages through the Lovable connector. That's a platform limit, not a missing piece we can build. It means:
- Outgoing replies work fully.
- Guest replies on WhatsApp reach Lamai's WhatsApp Business app, but they won't show up in the platform thread automatically.
- Getting incoming messages into the platform needs the project moved to the newer app setup (a separate, larger job), or the old direct Meta webhook set up with its own verify token. You'd choose that later.

## Unchanged

Messaging still can't touch bookings, pickups, payments, rooms or check-in. Internal notes never leave the platform. Email stays the guaranteed fallback.

## Technical notes

- `notify-guest-message`: the gateway calls `/messages` via `messagingConnector.ts` using LOVABLE_API_KEY + WHATSAPP_API_KEY. It checks `response.ok`, stores the returned `messages[0].id` in `messages.external_ref`, and logs the Meta error body on failure.
- Window check: find the latest guest message with `source='whatsapp'` for the booking. Because incoming messages aren't mirrored, treat the window as closed unless we have that proof, and use a template or email instead.
- Recipient: `profiles.whatsapp`, then `profiles.phone`, then `bookings.manual_guest_phone`, sent as E.164 digits without the "+".
- Template created with `POST /message_templates` (UTILITY, with an example value); its status is read back before first use.
- Redeploy `notify-guest-message`; test on Max's number first.
