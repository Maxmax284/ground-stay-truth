/**
 * Driver brief — the short message staff copy and send to a driver.
 *
 * Drivers do not have platform access. This is the whole of what they need:
 * who, when, where, what they look like. Deliberately excludes money, other
 * guests, booking references, provenance and anything diagnostic.
 */

export interface DriverBriefInput {
  guestName: string;
  guestPhone?: string | null;
  passengerCount?: number | null;
  flightNumber?: string | null;
  arrivalAirport?: string | null;
  arrivalDateTime?: string | null;
  meetingPoint?: string | null;
  driverName?: string | null;
  licensePlate?: string | null;
  luggageNotes?: string | null;
  specialInstructions?: string | null;
  readyAt?: string | null;
  collectedAt?: string | null;
}

const BANNED = /(price|total|deposit|balance|outstanding|booking ref)/i;

function localTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Plain text, one fact per line, safe to paste into WhatsApp or SMS. */
export function buildDriverBrief(input: DriverBriefInput): string {
  const lines: string[] = [];
  lines.push(`Pickup — ${input.guestName}`);

  const when = localTime(input.arrivalDateTime);
  const where = input.arrivalAirport ? input.arrivalAirport.toUpperCase() : null;
  if (input.flightNumber || where || when) {
    lines.push(
      `Flight: ${[input.flightNumber, where, when ? `arrives ${when} (Thai time)` : null]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (input.meetingPoint) lines.push(`Meet at: ${input.meetingPoint}`);
  if (input.passengerCount && input.passengerCount > 0) lines.push(`Passengers: ${input.passengerCount}`);
  if (input.guestPhone) lines.push(`Guest phone: ${input.guestPhone}`);
  if (input.luggageNotes) lines.push(`Luggage: ${input.luggageNotes}`);
  if (input.specialInstructions) lines.push(`Note: ${input.specialInstructions}`);
  if (input.driverName || input.licensePlate) {
    lines.push(`Driver: ${[input.driverName, input.licensePlate].filter(Boolean).join(" · ")}`);
  }

  if (input.collectedAt) {
    lines.push("Status: guest already collected.");
  } else if (input.readyAt) {
    lines.push("Status: guest is out with bags and waiting now.");
  } else {
    lines.push("Status: not out yet. We message you when the guest is ready — a landed plane is not a ready guest.");
  }

  return lines.filter((l) => !BANNED.test(l)).join("\n");
}
