import { canAccess, type Actor, type DocumentRef } from "./access";

/** No provider key, network client, document body or automatic invocation exists here. */
export async function verifyIdentity(actor: Actor | null, doc: DocumentRef | null, approvals: {
  enabled: boolean;
  processorApproved: boolean;
  legalApproved: boolean;
}, provider: () => Promise<unknown>) {
  if (!canAccess(actor, doc, "review")) return { status: "not_found" as const };
  if (!approvals.enabled || !approvals.processorApproved || !approvals.legalApproved) return { status: "manual_only" as const };
  return { status: "advisory" as const, result: await provider() };
}

export async function reviewManually(actor: Actor | null, doc: DocumentRef | null, now: string, write: (record: {
  documentId: string; bookingId: string; reviewedBy: string; reviewedAt: string; method: "manual";
}) => Promise<void>) {
  if (!actor || !doc || !canAccess(actor, doc, "review")) return { status: "not_found" as const };
  await write({ documentId: doc.id, bookingId: doc.bookingId, reviewedBy: actor.id, reviewedAt: now, method: "manual" });
  return { status: "reviewed" as const };
}

/** P1 candidate for the EXISTING dispatcher, not an Archives connector. */
export async function dispatchSigned(body: string, secret: string | null, adapters: {
  queue: () => Promise<void>;
  block: (code: "blocked_missing_secret") => Promise<void>;
  sign: (secret: string, body: string) => Promise<string>;
  send: (signature: string) => Promise<void>;
}) {
  await adapters.queue();
  if (!secret?.trim()) {
    await adapters.block("blocked_missing_secret");
    return "blocked" as const;
  }
  const signature = await adapters.sign(secret, body);
  if (!signature.trim()) throw new Error("Signature unavailable");
  await adapters.send(signature);
  return "sent" as const;
}