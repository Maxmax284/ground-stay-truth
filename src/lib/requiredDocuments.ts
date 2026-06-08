/**
 * Required Documents per Booking
 *
 * Documents are ADVISORY ONLY — they never block check-in or any operational action.
 * This module derives which document types staff should track for a given booking.
 *
 * Document types:
 *   - passport        : Passport (or any photo ID). Always advisory for every booking.
 *   - national_id     : National ID (alternative to passport)
 *   - visa            : Long-stay visa proof
 *   - tm30            : Thai immigration TM30 (property-filed for foreign long-stays)
 *   - other           : Free-form
 *
 * Thresholds are intentionally simple constants. Externalize to policy_settings later if needed.
 */

export type DocumentType = "passport" | "national_id" | "visa" | "tm30" | "other";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  passport: "Passport / ID",
  national_id: "National ID",
  visa: "Visa",
  tm30: "TM30 (Long-stay)",
  other: "Other",
};

export const DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  passport: "Photo ID for the guest. Optional — only required for specific guests under specific circumstances.",
  national_id: "Local national ID. Acceptable in place of passport.",
  visa: "Long-stay visa documentation if applicable.",
  tm30: "Thai immigration TM30 receipt. Filed by the property for foreign guests staying long-term.",
  other: "Any other supporting document.",
};

/** Long-stay threshold (nights) that triggers TM30 tracking. */
export const TM30_LONG_STAY_THRESHOLD_NIGHTS = 30;

export interface RequiredDoc {
  type: DocumentType;
  label: string;
  description: string;
  /** True for docs that are situational and never expected for most bookings. */
  optional: boolean;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * Determine which documents are RELEVANT for a booking.
 * Order: passport first (always), TM30 for long-stays, then optional extras.
 */
export function getRequiredDocsForBooking(opts: {
  checkIn: string;
  checkOut: string;
}): RequiredDoc[] {
  const nights = nightsBetween(opts.checkIn, opts.checkOut);
  const docs: RequiredDoc[] = [
    {
      type: "passport",
      label: DOCUMENT_TYPE_LABELS.passport,
      description: DOCUMENT_TYPE_DESCRIPTIONS.passport,
      optional: true, // advisory only — never blocks
    },
  ];

  if (nights >= TM30_LONG_STAY_THRESHOLD_NIGHTS) {
    docs.push({
      type: "tm30",
      label: DOCUMENT_TYPE_LABELS.tm30,
      description: DOCUMENT_TYPE_DESCRIPTIONS.tm30,
      optional: false, // expected for long-stays, but still doesn't block
    });
  }

  return docs;
}
