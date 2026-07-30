// supabase/functions/_shared/adminAlertCatalog.ts
// Mirror of src/lib/adminAlertCatalog.ts — keep in sync.
// The edge-function mirror lives at:
//   supabase/functions/_shared/adminAlertCatalog.ts
// Keep the two files in sync — they intentionally hold identical data so the
// Settings UI and the fan-out function agree on categories, severity and
// defaults without the frontend importing Deno code (or vice versa).
//
// Preference storage: `messaging_notification_prefs`
//   (user_id, channel, notification_type, enabled)
//   channel: 'in_app' | 'email' | 'telegram'
//   notification_type: an event key below, or one of the control keys:
//     __email_master__   -> master switch for admin email alerts (default ON)
//     __critical_only__  -> only critical/money/system alerts by email
// -----------------------------------------------------------------------------

export type AlertSeverity = "info" | "action" | "warning" | "critical";

export type AlertCategory =
  | "bookings"
  | "payments"
  | "guest_portal"
  | "rooms"
  | "maintenance"
  | "email_delivery"
  | "system"
  | "operations"
  | "ai"
  | "summary";

export interface AdminAlertEvent {
  key: string;
  label: string;
  description: string;
  category: AlertCategory;
  severity: AlertSeverity;
  /** Default state for the email channel when the admin has no saved row. */
  defaultEmail: boolean;
  /** Default state for the in-app bell when the admin has no saved row. */
  defaultInApp: boolean;
  /** Plain-English "what to do next" line used in admin alert emails. */
  nextAction: string;
  /** Where in CampStay this happened — used for the "Where" line. */
  where: string;
  /** true once a real source (trigger/function) emits this event. */
  wired: boolean;
  /** Critical-only mode keeps these flowing even when the mode is on. */
  bypassCriticalOnly?: boolean;
}

export const ALERT_CATEGORIES: { key: AlertCategory; label: string; blurb: string }[] = [
  { key: "bookings", label: "Bookings", blurb: "New requests, confirmations, cancellations, changes." },
  { key: "payments", label: "Payments", blurb: "Deposits, balances, failures, Stripe and reconciliation." },
  { key: "guest_portal", label: "Guest Portal", blurb: "What guests are doing (or getting stuck on) in the portal." },
  { key: "rooms", label: "Calendar / Rooms", blurb: "Assignment gaps, availability risk, calendar mismatches." },
  { key: "maintenance", label: "Maintenance", blurb: "Blocks created, resolved, rooms back in service." },
  { key: "email_delivery", label: "Email Delivery", blurb: "Guest email failures, bounces, resends, admin alert failures." },
  { key: "system", label: "System / Errors", blurb: "Webhooks, app health, client crashes, push problems." },
  { key: "operations", label: "Operations", blurb: "Pickups, overrides, discounts, notes, manual bookings." },
  { key: "ai", label: "AI / Kru Glitch", blurb: "Assistant failures and AI budget warnings." },
  { key: "summary", label: "Daily Summary", blurb: "Once-a-day roll-up instead of live pings." },
];

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: "Info",
  action: "Action Needed",
  warning: "Warning",
  critical: "Critical",
};

export const SEVERITY_PREFIX: Record<AlertSeverity, string> = {
  info: "[CampStay]",
  action: "[Action Needed]",
  warning: "[Warning]",
  critical: "[Critical]",
};

export const ADMIN_ALERT_EVENTS: AdminAlertEvent[] = [
  // ---------------------------------------------------------------- bookings
  {
    key: "new_booking_request", label: "New booking request",
    description: "A guest submits a new booking or inquiry.",
    category: "bookings", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Bookings", nextAction: "Review the booking and confirm the payment step.",
  },
  {
    key: "booking_confirmed", label: "Booking confirmed",
    description: "A booking moves into confirmed state.",
    category: "bookings", severity: "info", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Bookings", nextAction: "Nothing needed — confirmation email and PDF go out automatically.",
  },
  {
    key: "booking_cancelled", label: "Booking cancelled",
    description: "A booking transitions into cancelled state.",
    category: "bookings", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Bookings", nextAction: "Check refund rules and release the room on the calendar if needed.",
  },
  {
    key: "booking_changed", label: "Booking changed",
    description: "Dates, unit or guest count changed on an existing booking.",
    category: "bookings", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Bookings", nextAction: "Confirm pricing and the calendar still line up.",
  },
  {
    key: "room_assignment_needed", label: "Room assignment needed",
    description: "A confirmed booking has no unit assigned.",
    category: "rooms", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Calendar", nextAction: "Open the calendar and assign a unit before arrival.",
  },
  {
    key: "missing_confirmation_number", label: "Confirmed booking missing confirmation number",
    description: "A confirmed booking has no confirmation number generated.",
    category: "bookings", severity: "warning", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Bookings", nextAction: "Regenerate the confirmation so the guest PDF works.",
  },
  {
    key: "long_stay_booking", label: "Long stay booking created",
    description: "A booking of 14 nights or more was created.",
    category: "bookings", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Bookings", nextAction: "Check long-stay pricing tiers applied correctly.",
  },
  {
    key: "checkin_today", label: "Check-in today",
    description: "Daily list of arrivals.",
    category: "bookings", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Front Desk", nextAction: "Prep rooms and pickups for today's arrivals.",
  },
  {
    key: "checkin_tomorrow", label: "Check-in tomorrow",
    description: "Heads-up on tomorrow's arrivals.",
    category: "bookings", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Front Desk", nextAction: "Confirm transport and room readiness.",
  },
  {
    key: "checkout_today", label: "Checkout today",
    description: "Daily list of departures.",
    category: "bookings", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Front Desk", nextAction: "Schedule housekeeping turnover.",
  },
  {
    key: "checkout_tomorrow", label: "Checkout tomorrow",
    description: "Heads-up on tomorrow's departures.",
    category: "bookings", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Front Desk", nextAction: "Confirm balances are settled before departure.",
  },

  // ---------------------------------------------------------------- payments
  {
    key: "deposit_paid", label: "Deposit paid",
    description: "A deposit is recorded via Stripe or manual entry.",
    category: "payments", severity: "info", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Booking → Payments", nextAction: "None, unless the booking still shows the deposit outstanding.",
  },
  {
    key: "balance_paid", label: "Balance paid",
    description: "The remaining balance is recorded on a booking.",
    category: "payments", severity: "info", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Booking → Payments", nextAction: "None, unless the balance still shows outstanding.",
  },
  {
    key: "payment_failed", label: "Payment failed",
    description: "A guest payment attempt failed.",
    category: "payments", severity: "critical", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Booking → Payments", nextAction: "Contact the guest and regenerate the payment link.",
  },
  {
    key: "payment_link_failed", label: "Payment link failed",
    description: "A payment link failed or expired before the guest could pay.",
    category: "payments", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Booking → Payments", nextAction: "Regenerate and resend the payment link.",
  },
  {
    key: "payment_link_created", label: "Payment link created",
    description: "A staff member generated a payment link.",
    category: "payments", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Booking → Payments", nextAction: "None — informational only.",
  },
  {
    key: "stripe_diagnostics_no_go", label: "Stripe warning (NO-GO)",
    description: "The Stripe webhook self-test reports a broken pipeline.",
    category: "payments", severity: "critical", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Operations Monitor", nextAction: "Check Operations Monitor before taking action on any payment.",
  },
  {
    key: "reconciliation_mismatch", label: "Reconciliation mismatch",
    description: "Stripe and CampStay disagree on a recorded payment.",
    category: "payments", severity: "critical", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Operations Monitor", nextAction: "Compare the booking ledger against Stripe before refunding anything.",
  },

  // ------------------------------------------------------------ guest portal
  {
    key: "guest_message_received", label: "Guest message received",
    description: "A guest sends a message from the portal.",
    category: "guest_portal", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Messages", nextAction: "Reply from the Messages inbox.",
  },
  {
    key: "guest_stuck_at_payment", label: "Guest stuck at payment",
    description: "Guest tapped Pay but never reached Stripe.",
    category: "guest_portal", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Operations Monitor → Guest Portal Health",
    nextAction: "Open the booking and contact the guest if the deposit is still pending.",
  },
  {
    key: "guest_uploaded_id", label: "Guest uploaded ID",
    description: "A guest uploaded an identity document.",
    category: "guest_portal", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Booking → Documents", nextAction: "Review the document and mark it verified.",
  },
  {
    key: "guest_id_upload_failed", label: "ID upload failed",
    description: "A guest document upload errored out.",
    category: "guest_portal", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Booking → Documents", nextAction: "Ask the guest to retry, or collect the document at check-in.",
  },
  {
    key: "guest_logged_in", label: "Guest logged in",
    description: "A guest signed into the portal.",
    category: "guest_portal", severity: "info", defaultEmail: false, defaultInApp: false, wired: true,
    where: "Guest Portal", nextAction: "None — informational only.",
  },
  {
    key: "guest_viewed_no_pay", label: "Guest viewed booking but did not pay",
    description: "Guest opened the booking and left without paying.",
    category: "guest_portal", severity: "info", defaultEmail: false, defaultInApp: false, wired: true,
    where: "Guest Portal", nextAction: "Follow up if the deadline is close.",
  },
  {
    key: "guest_reached_stripe", label: "Guest reached Stripe",
    description: "Guest successfully landed on the Stripe checkout page.",
    category: "guest_portal", severity: "info", defaultEmail: false, defaultInApp: false, wired: true,
    where: "Guest Portal", nextAction: "None — informational only.",
  },
  {
    key: "guest_in_app_browser", label: "Guest opened portal in in-app browser",
    description: "Portal opened inside Instagram/Facebook/LINE browser, which can block checkout.",
    category: "guest_portal", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Guest Portal", nextAction: "If they get stuck, tell them to open the link in Safari or Chrome.",
  },

  // ------------------------------------------------------- rooms/maintenance
  {
    key: "maintenance_block_created", label: "Maintenance block created",
    description: "A unit was taken out of service.",
    category: "maintenance", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Calendar", nextAction: "Check no confirmed booking overlaps the blocked dates.",
  },
  {
    key: "maintenance_block_resolved", label: "Maintenance block removed",
    description: "A unit was returned to service.",
    category: "maintenance", severity: "info", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Calendar", nextAction: "Confirm the room is clean and bookable again.",
  },
  {
    key: "room_unavailable", label: "Room unavailable",
    description: "A unit was deactivated or became unbookable.",
    category: "rooms", severity: "warning", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Units", nextAction: "Check availability impact on upcoming bookings.",
  },
  {
    key: "calendar_mismatch", label: "Potential calendar mismatch",
    description: "Availability checks disagree with the booking ledger.",
    category: "rooms", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Calendar", nextAction: "Run the availability consistency check in Operations Monitor.",
  },

  // ---------------------------------------------------------- email delivery
  {
    key: "guest_email_failed", label: "Guest confirmation email failed",
    description: "A guest-facing transactional email failed to send.",
    category: "email_delivery", severity: "critical", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Booking → Email status", nextAction: "Resend the confirmation, or contact the guest directly.",
  },
  {
    key: "payment_email_failed", label: "Payment email failed",
    description: "A payment link or reminder email failed to send.",
    category: "email_delivery", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Booking → Email status", nextAction: "Resend the payment email or send the link by WhatsApp.",
  },
  {
    key: "admin_alert_email_failed", label: "Admin alert email failed",
    description: "An admin alert email could not be delivered.",
    category: "email_delivery", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Operations Monitor → Admin Email Health",
    nextAction: "Check the sending domain status and the admin's email address.",
  },
  {
    key: "guest_has_no_email", label: "Guest has no email",
    description: "A booking exists with no usable guest email address.",
    category: "email_delivery", severity: "action", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Guest Directory", nextAction: "Add an email to the guest record so confirmations can send.",
  },
  {
    key: "email_resend_performed", label: "Resend performed",
    description: "Staff manually resent a guest email.",
    category: "email_delivery", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Booking → Email status", nextAction: "None — informational only.",
  },

  // ----------------------------------------------------------- system/errors
  {
    key: "webhook_failure", label: "Webhook failure",
    description: "An inbound webhook (Stripe, Fenrir) failed processing.",
    category: "system", severity: "critical", defaultEmail: true, defaultInApp: true, wired: true,
    bypassCriticalOnly: true,
    where: "Operations Monitor", nextAction: "Open Operations Monitor and check the webhook health panel.",
  },
  {
    key: "client_error", label: "Page crash / client error",
    description: "The app threw an unhandled error for a user.",
    category: "system", severity: "warning", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Operations Monitor", nextAction: "Check whether it repeats on the same page before escalating.",
  },
  {
    key: "app_health_warning", label: "App health warning",
    description: "Service worker, domain or PWA health degraded.",
    category: "system", severity: "warning", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Operations Monitor", nextAction: "Check App Status in Settings.",
  },
  {
    key: "push_failure", label: "Push notification failure",
    description: "Phone alerts failed to deliver (active once push is reconnected).",
    category: "system", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Operations Monitor → Push Health", nextAction: "Have the device reconnect alerts in Settings.",
  },

  // ------------------------------------------------------------- operations
  {
    key: "airport_pickup_requested", label: "Airport pickup requested",
    description: "A guest requested an airport pickup.",
    category: "operations", severity: "action", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Front Desk → Pickups", nextAction: "Assign a driver and confirm the flight details.",
  },
  {
    key: "pickup_fee_added", label: "Pickup fee added",
    description: "A pickup fee was added to a booking as an add-on charge.",
    category: "operations", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Booking → Payments", nextAction: "None — the fee lands in the outstanding balance.",
  },
  {
    key: "staff_override_used", label: "Staff override used",
    description: "A staff member used an override (expiry, past dates, etc).",
    category: "operations", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Operations Monitor → Staff Activity", nextAction: "Confirm the override was intentional.",
  },
  {
    key: "admin_discount_applied", label: "Admin discount applied",
    description: "A discount or adjustment was applied to a booking.",
    category: "operations", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Booking → Adjustments", nextAction: "Confirm the adjustment matches what was agreed with the guest.",
  },
  {
    key: "booking_adjustment_voided", label: "Booking adjustment voided",
    description: "A previously applied adjustment was voided.",
    category: "operations", severity: "warning", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Booking → Adjustments", nextAction: "Check the balance recalculated correctly.",
  },
  {
    key: "manual_booking_created", label: "Manual booking created",
    description: "Staff created a booking directly in the platform.",
    category: "operations", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Bookings", nextAction: "None — informational only.",
  },
  {
    key: "guest_note_added", label: "Guest note added",
    description: "A staff note was added to a guest record.",
    category: "operations", severity: "info", defaultEmail: false, defaultInApp: false, wired: true,
    where: "Guest Directory", nextAction: "None — informational only.",
  },
  {
    key: "laundry_request", label: "Laundry request created or ready",
    description: "A laundry request was raised or completed.",
    category: "operations", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Stay Support", nextAction: "None — handled by housekeeping.",
  },

  // --------------------------------------------------------------------- AI
  {
    key: "ai_assistant_failure", label: "Kru Glitch load/error",
    description: "The AI assistant failed to load or answer.",
    category: "ai", severity: "warning", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Operations Monitor", nextAction: "Check the AI gateway status if it keeps repeating.",
  },
  {
    key: "ai_budget_warning", label: "AI budget warning",
    description: "AI spend crossed the configured threshold.",
    category: "ai", severity: "warning", defaultEmail: true, defaultInApp: true, wired: true,
    where: "Settings → AI", nextAction: "Review AI usage and raise or hold the budget.",
  },

  // ---------------------------------------------------------------- summary
  {
    key: "daily_summary", label: "Daily summary",
    description: "One roll-up email per day instead of live pings.",
    category: "summary", severity: "info", defaultEmail: false, defaultInApp: true, wired: true,
    where: "Dashboard", nextAction: "Skim the day's numbers.",
  },
];

export const EVENTS_BY_KEY: Record<string, AdminAlertEvent> = Object.fromEntries(
  ADMIN_ALERT_EVENTS.map((e) => [e.key, e]),
);

export const PREF_EMAIL_MASTER = "__email_master__";
export const PREF_CRITICAL_ONLY = "__critical_only__";

/** Critical-only mode keeps critical severity plus anything flagged bypass. */
export function passesCriticalOnly(event: AdminAlertEvent): boolean {
  return event.severity === "critical" || event.bypassCriticalOnly === true;
}
