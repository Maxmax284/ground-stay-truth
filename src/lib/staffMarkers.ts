/**
 * Staff markers — "handled offline" acknowledgements and "paying on arrival".
 *
 * Purely operational framing. These markers NEVER change money owed, payment
 * obligations, or the booking state machine. They only tell the front desk
 * "a human already dealt with this, stop shouting about it".
 *
 * Storage:
 *   bookings.pay_on_arrival            boolean
 *   bookings.offline_acknowledgements  jsonb  { [item]: { at, by, reason } }
 */

export type OfflineAckItem =
  | "deposit"
  | "balance"
  | "id_document"
  | "security_deposit";

export const OFFLINE_ACK_ITEMS: OfflineAckItem[] = [
  "deposit",
  "balance",
  "id_document",
  "security_deposit",
];

export const OFFLINE_ACK_LABELS: Record<OfflineAckItem, string> = {
  deposit: "Deposit handled offline",
  balance: "Balance collected offline",
  id_document: "ID checked in person",
  security_deposit: "Security deposit handled offline",
};

export const OFFLINE_ACK_HELP: Record<OfflineAckItem, string> = {
  deposit: "Guest paid the deposit by bank transfer, cash, or another channel outside the app.",
  balance: "The remaining balance was collected in person. The ledger still shows what is owed.",
  id_document: "Staff saw the passport or ID at the desk — no upload needed.",
  security_deposit: "Security deposit was taken or waived in person.",
};

export interface OfflineAckRecord {
  at: string;
  by: string | null;
  reason: string | null;
}

export type OfflineAcks = Partial<Record<OfflineAckItem, OfflineAckRecord>>;

/** Normalize whatever is stored on the booking into a typed map. */
export function readOfflineAcks(value: unknown): OfflineAcks {
  if (!value || typeof value !== "object") return {};
  const src = value as Record<string, any>;
  const out: OfflineAcks = {};
  for (const item of OFFLINE_ACK_ITEMS) {
    const row = src[item];
    if (row && typeof row === "object" && row.at) {
      out[item] = {
        at: String(row.at),
        by: row.by ? String(row.by) : null,
        reason: row.reason ? String(row.reason) : null,
      };
    }
  }
  return out;
}

export function isAcknowledged(booking: any, item: OfflineAckItem): boolean {
  return !!readOfflineAcks(booking?.offline_acknowledgements)[item];
}

export function isPayOnArrival(booking: any): boolean {
  return booking?.pay_on_arrival === true;
}

/** Count of items staff have confirmed offline — used for quiet summary chips. */
export function acknowledgedCount(booking: any): number {
  return Object.keys(readOfflineAcks(booking?.offline_acknowledgements)).length;
}

/**
 * Should the front desk still treat this money gap as a problem?
 * Pay-on-arrival and offline acknowledgement both mute the alarm — the balance
 * itself is still shown everywhere it always was.
 */
export function isMoneyGapMuted(booking: any): boolean {
  return (
    isPayOnArrival(booking) ||
    isAcknowledged(booking, "deposit") ||
    isAcknowledged(booking, "balance")
  );
}
