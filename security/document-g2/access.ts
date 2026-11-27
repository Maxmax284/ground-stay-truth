/** G2 candidate only: no application imports or live backend adapter. */
/** Must be constructed from validated claims and protected DB rows, never request JSON. */
export type Actor = {
  id: string;
  roles: string[];
  assignedProperties: string[];
  environment: "production" | "sandbox";
  aal: "aal1" | "aal2";
};
export type DocumentRef = {
  id: string;
  bookingId: string;
  propertyId: string;
  guestId: string | null;
  environment: "production" | "sandbox";
  path: string;
  state: "pending_scan" | "clean" | "rejected";
};
const STAFF = ["admin", "manager", "front_desk_supervisor", "front_desk"];
export const LINK_TTL_SECONDS = 120;

export function canAccess(actor: Actor | null, doc: DocumentRef | null, action: "read" | "upload" | "review", requireMfa = true): boolean {
  if (!actor || !doc || actor.environment !== doc.environment) return false;
  const staff = actor.roles.some(role => STAFF.includes(role));
  // Neither role alone nor knowing a manual guest's booking ID grants access.
  if (staff) {
    if (!actor.assignedProperties.includes(doc.propertyId)) return false;
    if (requireMfa && actor.aal !== "aal2") return false;
  } else if (actor.id !== doc.guestId || action === "review") return false;
  return action !== "read" || doc.state === "clean";
}

export function validObjectPath(path: string, bookingId: string): boolean {
  const parts = path.split("/");
  return parts.length >= 2 && parts[0] === bookingId && parts.every(p => p.length > 0 && p !== "." && p !== ".." && !/[\\?#\u0000]/.test(p));
}

export type LinkAdapters = {
  find: (id: string) => Promise<DocumentRef | null>;
  audit: (event: { actorId: string; documentId: string; bookingId: string; action: "link_requested" }) => Promise<void>;
  sign: (path: string, ttl: number) => Promise<string>;
};
export async function openDocument(actor: Actor | null, id: string, adapters: LinkAdapters) {
  // Unauthenticated callers must not cause even a metadata read.
  if (!actor) return { status: 404 as const };
  const doc = await adapters.find(id);
  if (!doc || !canAccess(actor, doc, "read") || !validObjectPath(doc.path, doc.bookingId)) return { status: 404 as const };
  // An audit failure fails closed; no bearer link is issued.
  await adapters.audit({ actorId: actor.id, documentId: doc.id, bookingId: doc.bookingId, action: "link_requested" });
  const url = await adapters.sign(doc.path, LINK_TTL_SECONDS);
  return { status: 200 as const, url };
}

/** Newly written messages store a reference, never a signed URL. */
export function messageAttachment(doc: DocumentRef) {
  if (!validObjectPath(doc.path, doc.bookingId)) throw new Error("Invalid attachment reference");
  return { documentId: doc.id, bucket: "guest-documents" as const, objectPath: doc.path };
}

/** Header inspection is not malware scanning; every upload remains quarantined. */
export function validateUpload(mime: string, bytes: Uint8Array, declaredSize: number, bucket: "guest-documents" | "maintenance-photos" | "tax-invoices" | "booking-confirmations" = "guest-documents") {
  if (declaredSize <= 0 || declaredSize > 10 * 1024 * 1024 || bytes.length !== declaredSize) return { accepted: false as const, reason: "size" };
  if ((bucket === "tax-invoices" || bucket === "booking-confirmations") && mime !== "application/pdf") return { accepted: false as const, reason: "type" };
  if (bucket === "maintenance-photos" && !mime.startsWith("image/")) return { accepted: false as const, reason: "type" };
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v);
  const ascii = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  const matches = (mime === "image/jpeg" && starts(0xff, 0xd8, 0xff))
    || (mime === "image/png" && starts(137, 80, 78, 71, 13, 10, 26, 10))
    || (mime === "image/webp" && ascii(0, "RIFF") && ascii(8, "WEBP"))
    || (mime === "application/pdf" && ascii(0, "%PDF-"));
  // HEIC requires a vetted decoder/validator; reject rather than pretend a header proves safety.
  if (!matches) return { accepted: false as const, reason: "type" };
  return { accepted: true as const, state: "pending_scan" as const };
}

export function releaseQuarantine(verdict: { signatureValid: boolean; parserValid: boolean; malware: "clean" | "infected" | "unavailable" }) {
  return verdict.signatureValid && verdict.parserValid && verdict.malware === "clean" ? "clean" as const : "pending_scan" as const;
}