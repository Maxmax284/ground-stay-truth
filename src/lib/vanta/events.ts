// Vanta event-type constants + payload-summary builders.
// Keep payload summaries small and PII-masked. UUIDs only, no names/emails.

export const VANTA_EVENT_TYPES = [
  "booking.created",
  "booking.state_changed",
  "guest_message.received",
  "guest_request.created",
  "payment.received",
  "payment.failed",
  "integration.test",
] as const;

export type VantaEventType = (typeof VANTA_EVENT_TYPES)[number];

export const VANTA_EVENT_LABELS: Record<VantaEventType, string> = {
  "booking.created": "Booking created",
  "booking.state_changed": "Booking state changed",
  "guest_message.received": "Guest message received",
  "guest_request.created": "Guest request created",
  "payment.received": "Payment received",
  "payment.failed": "Payment failed",
  "integration.test": "Integration test",
};

export const VANTA_EVENT_SENSITIVE: Record<VantaEventType, boolean> = {
  "booking.created": false,
  "booking.state_changed": false,
  "guest_message.received": true,
  "guest_request.created": true,
  "payment.received": true,
  "payment.failed": true,
  "integration.test": false,
};
