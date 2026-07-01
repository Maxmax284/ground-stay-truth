// Unified guest display resolver.
// Priority: linked profile name → manual_guest_name → manual_guest_email → "Guest".
// Use everywhere the UI needs a human label for a booking's guest.

export interface GuestDisplaySource {
  manual_guest_name?: string | null;
  manual_guest_email?: string | null;
  manual_guest_phone?: string | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
  guest?: { full_name?: string | null; email?: string | null } | null;
}

export function resolveGuestDisplayName(booking?: GuestDisplaySource | null): string {
  if (!booking) return "Guest";
  const profileName =
    booking.profiles?.full_name?.trim() ||
    booking.guest?.full_name?.trim() ||
    booking.profiles?.email?.trim() ||
    booking.guest?.email?.trim();
  if (profileName) return profileName;
  const manual =
    booking.manual_guest_name?.trim() ||
    booking.manual_guest_email?.trim() ||
    booking.manual_guest_phone?.trim();
  return manual || "Guest";
}

export function hasManualGuestIdentity(booking?: GuestDisplaySource | null): boolean {
  if (!booking) return false;
  return !!(booking.manual_guest_name || booking.manual_guest_email || booking.manual_guest_phone);
}
