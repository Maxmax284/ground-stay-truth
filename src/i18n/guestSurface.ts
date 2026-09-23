/**
 * Which parts of the dictionary a guest can actually see.
 *
 * A language is only offered to guests once every key in this set has a real
 * translation. Staff-only screens (front desk, admin, reports) are allowed to
 * stay English — staff choose English or Thai deliberately — but a guest must
 * never land on a half-translated page.
 */
export const GUEST_SURFACE_PREFIXES = [
  "common",
  "nav",
  "states",
  "labels",
  "language",
  "notFound",
  "protectedRoute",
  "auth",
  "guestAuth",
  "guestPortal",
  "guestBooking",
  "guestStay",
  "nowCard",
  "journeyStage",
  "journeyIntake",
  "whileYouWait",
  "handshake",
  "arrivalFAQ",
  "campInfo",
  "bookingForm",
  "payments",
  "deposit",
  "messages",
  "documents",
  "checkin",
] as const;

export function isGuestSurfaceKey(key: string): boolean {
  const top = key.split(".")[0];
  return (GUEST_SURFACE_PREFIXES as readonly string[]).includes(top);
}

/**
 * Languages complete enough to offer a guest, measured by the coverage test in
 * src/lib/__tests__/i18nCoverage.test.ts. Adding a code here without passing
 * that test fails the build — that's the point.
 */
export const GUEST_READY_LANGUAGES = ["en", "th", "fr", "de"] as const;

export type GuestReadyLanguage = (typeof GUEST_READY_LANGUAGES)[number];

export function isGuestReady(code: string): boolean {
  return (GUEST_READY_LANGUAGES as readonly string[]).includes(code);
}
