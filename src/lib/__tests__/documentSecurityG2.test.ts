import { describe, expect, it, vi } from "vitest";
import { canAccess, messageAttachment, openDocument, releaseQuarantine, validateUpload, validObjectPath, type Actor, type DocumentRef } from "../../../security/document-g2/access";
import { classify, inventory, runCleanup, type CleanupAdapters, type RetentionItem, type RetentionPolicy } from "../../../security/document-g2/cleanup";
import { dispatchSigned, reviewManually, verifyIdentity } from "../../../security/document-g2/verification";

// Entire fixture dataset is fabricated; no environment variables or application client imports.
const staff: Actor = { id: "synthetic-staff", roles: ["front_desk"], assignedProperties: ["property-a"], environment: "production", aal: "aal2" };
const guest: Actor = { id: "synthetic-guest", roles: ["guest"], assignedProperties: [], environment: "production", aal: "aal1" };
const doc: DocumentRef = { id: "synthetic-doc", bookingId: "booking-a", propertyId: "property-a", guestId: guest.id, environment: "production", path: "booking-a/random.pdf", state: "clean" };
const links = () => ({ find: vi.fn(async () => doc as DocumentRef | null), audit: vi.fn(async () => {}), sign: vi.fn(async () => "synthetic-link") });

describe("G2 isolated authorization candidates (not a database RLS test)", () => {
  it("allows assigned front desk staff", () => expect(canAccess(staff, doc, "read")).toBe(true));
  it.each(["admin", "manager", "front_desk_supervisor", "front_desk"])("requires property assignment even for %s", role => {
    expect(canAccess({ ...staff, roles: [role], assignedProperties: [] }, doc, "read")).toBe(false);
  });
  it("allows an explicitly assigned multi-property admin", () => expect(canAccess({ ...staff, roles: ["admin"], assignedProperties: ["property-a", "property-b"] }, { ...doc, propertyId: "property-b" }, "read")).toBe(true));
  it("denies sandbox access even with a property assignment", () => expect(canAccess(staff, { ...doc, environment: "sandbox" }, "read")).toBe(false));
  it("allows staff to review a manual booking using its property", () => expect(canAccess(staff, { ...doc, guestId: null }, "review")).toBe(true));
  it("does not give a guest access to a manual booking", () => expect(canAccess(guest, { ...doc, guestId: null }, "read")).toBe(false));
  it("allows guest own uploads and clean reads", () => {
    expect(canAccess(guest, doc, "upload")).toBe(true);
    expect(canAccess(guest, doc, "read")).toBe(true);
  });
  it("denies another guest", () => expect(canAccess({ ...guest, id: "other-guest" }, doc, "read")).toBe(false));
  it("denies guest review", () => expect(canAccess(guest, doc, "review")).toBe(false));
  it("denies viewer and client-supplied service role", () => {
    for (const role of ["viewer", "service_role"]) expect(canAccess({ ...staff, roles: [role] }, doc, "read")).toBe(false);
  });
  it("requires server-verified aal2 for staff reads", () => expect(canAccess({ ...staff, aal: "aal1" }, doc, "read")).toBe(false));
  it("does not serve quarantined files", () => expect(canAccess(staff, { ...doc, state: "pending_scan" }, "read")).toBe(false));
  it("permits property-authorized quarantine review", () => expect(canAccess(staff, { ...doc, state: "pending_scan" }, "review")).toBe(true));
  it("gives identical not-found results for missing and unauthorized IDs", async () => {
    const adapters = links();
    const denied = await openDocument({ ...guest, id: "other" }, doc.id, adapters);
    adapters.find.mockResolvedValue(null);
    expect(await openDocument(staff, "missing", adapters)).toEqual(denied);
    expect(denied).toEqual({ status: 404 });
    expect(adapters.sign).not.toHaveBeenCalled();
  });
  it("signed-out requests do not perform a lookup", async () => {
    const adapters = links();
    expect(await openDocument(null, doc.id, adapters)).toEqual({ status: 404 });
    expect(adapters.find).not.toHaveBeenCalled();
  });
  it("issues exactly a 120-second link only after an audit", async () => {
    const adapters = links();
    expect(await openDocument(staff, doc.id, adapters)).toEqual({ status: 200, url: "synthetic-link" });
    expect(adapters.sign).toHaveBeenCalledWith(doc.path, 120);
    expect(adapters.audit.mock.invocationCallOrder[0]).toBeLessThan(adapters.sign.mock.invocationCallOrder[0]);
  });
  it("audit failure issues no link", async () => {
    const adapters = links();
    adapters.audit.mockRejectedValue(new Error("synthetic audit outage"));
    await expect(openDocument(staff, doc.id, adapters)).rejects.toThrow();
    expect(adapters.sign).not.toHaveBeenCalled();
  });
  it("stores a new attachment reference instead of a bearer URL", () => expect(messageAttachment(doc)).toEqual({ documentId: doc.id, bucket: "guest-documents", objectPath: "booking-a/random.pdf" }));
  it.each(["other/file.pdf", "booking-a/../file.pdf", "booking-a/file?token=x", "booking-a//file.pdf", "booking-a\\file.pdf"])("denies malformed path %s", path => expect(validObjectPath(path, doc.bookingId)).toBe(false));
});

describe("G2 upload quarantine candidates", () => {
  const pdf = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]);
  it("admits a matching PDF into quarantine, not clean state", () => expect(validateUpload("application/pdf", pdf, pdf.length)).toEqual({ accepted: true, state: "pending_scan" }));
  it("rejects an executable", () => expect(validateUpload("application/x-msdownload", new Uint8Array([77, 90]), 2).accepted).toBe(false));
  it("rejects wrong magic bytes", () => expect(validateUpload("image/png", pdf, pdf.length).accepted).toBe(false));
  it("rejects files above 10MB", () => expect(validateUpload("application/pdf", pdf, 10 * 1024 * 1024 + 1).accepted).toBe(false));
  it("rejects a truncated declared body", () => expect(validateUpload("application/pdf", pdf, pdf.length + 1).accepted).toBe(false));
  it("rejects HEIC until a real validator is selected", () => expect(validateUpload("image/heic", pdf, pdf.length).accepted).toBe(false));
  it("signature alone never releases quarantine", () => expect(releaseQuarantine({ signatureValid: true, parserValid: true, malware: "unavailable" })).toBe("pending_scan"));
  it("requires all validations before release", () => expect(releaseQuarantine({ signatureValid: true, parserValid: true, malware: "clean" })).toBe("clean"));
  it("infected files remain unavailable", () => expect(releaseQuarantine({ signatureValid: true, parserValid: true, malware: "infected" })).toBe("pending_scan"));
  it("maintenance uploads reject PDF even when its signature matches", () => expect(validateUpload("application/pdf", pdf, pdf.length, "maintenance-photos").accepted).toBe(false));
  it.each(["tax-invoices", "booking-confirmations"] as const)("%s rejects images", bucket => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(validateUpload("image/png", png, png.length, bucket).accepted).toBe(false);
  });
});

const now = Date.parse("2026-11-27T03:57:00Z");
// Windows below reproduce the old code only as synthetic test inputs, NOT legal approval.
const policy: RetentionPolicy = { approved: true, retainedDays: 90, orphanDays: 7, reviewDue: "2026-12-27T00:00:00Z" };
const item: RetentionItem = { id: "synthetic-doc", path: doc.path, environment: "production", held: false, referenced: true, createdAt: "2026-01-01T00:00:00Z", checkout: "2026-01-02T00:00:00Z", bookingState: "completed" };
const cleanupAdapters = (): CleanupAdapters & { remove: ReturnType<typeof vi.fn>; deleteRow: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> } => ({
  audit: vi.fn(async () => {}), recheck: vi.fn(async (value: RetentionItem) => value), remove: vi.fn(async () => {}), exists: vi.fn(async () => false), deleteRow: vi.fn(async () => {}),
});

describe("G2 dry-run and staged cleanup candidates", () => {
  it("walks nested folders and paginates 501+ objects", async () => {
    const tree: Record<string, { name: string; folder: boolean }[]> = {
      "": [{ name: "booking-a", folder: true }],
      "booking-a": [{ name: "nested", folder: true }],
      "booking-a/nested": Array.from({ length: 601 }, (_, i) => ({ name: `synthetic-${i}.pdf`, folder: false })),
    };
    const list = vi.fn(async (prefix: string, offset: number, limit: number) => (tree[prefix] ?? []).slice(offset, offset + limit));
    const paths = await inventory(list);
    expect(paths).toHaveLength(601);
    expect(paths).toContain("booking-a/nested/synthetic-600.pdf");
    expect(list).toHaveBeenCalledWith("booking-a/nested", 600, 100);
  });
  it("aborts inventory on listing failures", async () => await expect(inventory(async () => { throw new Error("synthetic outage"); })).rejects.toThrow("synthetic outage"));
  it("detects non-advancing pagination", async () => await expect(inventory(async () => [{ name: "one", folder: false }], 1)).rejects.toThrow("Pagination did not advance"));
  it("never disposes held documents", () => expect(classify({ ...item, held: true }, policy, now)).toBe("held"));
  it("requires policy approval", () => expect(classify(item, { ...policy, approved: false }, now)).toBe("policy_required"));
  it("stops disposition after policy review expires", () => expect(classify(item, { ...policy, reviewDue: "2026-01-01" }, now)).toBe("policy_required"));
  it("keeps active bookings even if old", () => expect(classify({ ...item, bookingState: "checked_in" }, policy, now)).toBe("keep"));
  it("unknown checkout is not eligible", () => expect(classify({ ...item, checkout: null }, policy, now)).toBe("unknown"));
  it("does not remove on the exact configured retention boundary", () => expect(classify({ ...item, checkout: new Date(now - 90 * 86400000).toISOString() }, policy, now)).toBe("keep"));
  it("keeps future checkout dates", () => expect(classify({ ...item, checkout: new Date(now + 86400000).toISOString() }, policy, now)).toBe("keep"));
  it("marks old orphan files eligible only under an approved policy", () => expect(classify({ ...item, id: null, referenced: false }, policy, now)).toBe("eligible"));
  it("default dry-run returns counts and never invokes mutation adapters", async () => {
    const adapters = cleanupAdapters();
    const result = await runCleanup([item, { ...item, held: true }], policy, now, adapters, { environment: "production" });
    expect(result.eligible).toBe(1); expect(result.held).toBe(1); expect(result.removed).toBe(0);
    expect(adapters.remove).not.toHaveBeenCalled(); expect(adapters.deleteRow).not.toHaveBeenCalled(); expect(adapters.audit).not.toHaveBeenCalled();
  });
  it("counts missing-policy documents for staged owner review", async () => expect((await runCleanup([item], null, now, cleanupAdapters(), { environment: "production" })).policyRequired).toBe(1));
  it("does not cross the environment boundary", async () => expect((await runCleanup([{ ...item, environment: "sandbox" }], policy, now, cleanupAdapters(), { environment: "production" })).outsideEnvironment).toBe(1));
  it("requires separate disposal approval", async () => await expect(runCleanup([item], policy, now, cleanupAdapters(), { environment: "production", mode: "dispose", maxBatch: 1 })).rejects.toThrow("Separate disposal approval"));
  it("bounds even approved synthetic disposition", async () => {
    const adapters = cleanupAdapters();
    expect((await runCleanup([item, { ...item, id: "doc-2" }], policy, now, adapters, { environment: "production", mode: "dispose", disposalApproved: true, maxBatch: 1 })).removed).toBe(1);
    expect(adapters.remove).toHaveBeenCalledTimes(1);
  });
  it("keeps database rows when storage removal fails", async () => {
    const adapters = cleanupAdapters(); adapters.remove.mockRejectedValue(new Error("synthetic failure"));
    expect((await runCleanup([item], policy, now, adapters, { environment: "production", mode: "dispose", disposalApproved: true, maxBatch: 1 })).failed).toBe(1);
    expect(adapters.deleteRow).not.toHaveBeenCalled();
    expect(adapters.audit).toHaveBeenLastCalledWith({ id: item.id, stage: "failed", code: "disposition_failed" });
  });
  it("keeps rows when removal cannot be confirmed", async () => {
    const adapters = { ...cleanupAdapters(), exists: vi.fn(async () => true) };
    expect((await runCleanup([item], policy, now, adapters, { environment: "production", mode: "dispose", disposalApproved: true, maxBatch: 1 })).failed).toBe(1);
    expect(adapters.deleteRow).not.toHaveBeenCalled();
  });
  it("rechecks a newly applied hold before removing", async () => {
    const adapters = { ...cleanupAdapters(), recheck: vi.fn(async () => ({ ...item, held: true })) };
    await runCleanup([item], policy, now, adapters, { environment: "production", mode: "dispose", disposalApproved: true, maxBatch: 1 });
    expect(adapters.remove).not.toHaveBeenCalled();
  });
  it("does not remove when planned evidence cannot be written", async () => {
    const adapters = cleanupAdapters(); adapters.audit.mockRejectedValueOnce(new Error("synthetic audit outage"));
    await runCleanup([item], policy, now, adapters, { environment: "production", mode: "dispose", disposalApproved: true, maxBatch: 1 });
    expect(adapters.remove).not.toHaveBeenCalled();
  });
  it("stops the batch and records partial failure when row deletion fails", async () => {
    const adapters = cleanupAdapters(); adapters.deleteRow.mockRejectedValue(new Error("synthetic row failure"));
    const result = await runCleanup([item, { ...item, id: "synthetic-next" }], policy, now, adapters, { environment: "production", mode: "dispose", disposalApproved: true, maxBatch: 2 });
    expect(result.failed).toBe(1); expect(result.removed).toBe(0); expect(adapters.remove).toHaveBeenCalledTimes(1);
    expect(adapters.audit).toHaveBeenLastCalledWith({ id: item.id, stage: "failed", code: "disposition_failed" });
  });
});

describe("G2 AI gate, manual review and existing dispatcher candidates", () => {
  it("default-off verification makes zero provider calls", async () => {
    const provider = vi.fn();
    expect(await verifyIdentity(staff, doc, { enabled: false, processorApproved: false, legalApproved: false }, provider)).toEqual({ status: "manual_only" });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([{ enabled: true, processorApproved: false, legalApproved: true }, { enabled: true, processorApproved: true, legalApproved: false }])("requires both human approvals: %j", async approvals => {
    const provider = vi.fn(); await verifyIdentity(staff, doc, approvals, provider); expect(provider).not.toHaveBeenCalled();
  });
  it("denies cross-property verification before any provider call", async () => {
    const provider = vi.fn();
    expect(await verifyIdentity({ ...staff, assignedProperties: [] }, doc, { enabled: true, processorApproved: true, legalApproved: true }, provider)).toEqual({ status: "not_found" });
    expect(provider).not.toHaveBeenCalled();
  });
  it("manual review records staff attribution and no provider call", async () => {
    const write = vi.fn(async () => {});
    expect(await reviewManually(staff, doc, "2026-11-27T03:57:00Z", write)).toEqual({ status: "reviewed" });
    expect(write).toHaveBeenCalledWith({ documentId: doc.id, bookingId: doc.bookingId, reviewedBy: staff.id, reviewedAt: "2026-11-27T03:57:00Z", method: "manual" });
  });
  it.each([null, "", "   "])("missing signing configuration never sends: %j", async missing => {
    const adapters = { queue: vi.fn(async () => {}), block: vi.fn(async () => {}), sign: vi.fn(async () => "synthetic-signature"), send: vi.fn(async () => {}) };
    expect(await dispatchSigned("synthetic-body", missing, adapters)).toBe("blocked");
    expect(adapters.queue).toHaveBeenCalledOnce(); expect(adapters.block).toHaveBeenCalledWith("blocked_missing_secret"); expect(adapters.send).not.toHaveBeenCalled();
  });
  it("configured dispatch retains signing and delivery order", async () => {
    const adapters = { queue: vi.fn(async () => {}), block: vi.fn(async () => {}), sign: vi.fn(async () => "synthetic-signature"), send: vi.fn(async () => {}) };
    expect(await dispatchSigned("synthetic-body", "synthetic-test-only", adapters)).toBe("sent");
    expect(adapters.send).toHaveBeenCalledWith("synthetic-signature");
    expect(adapters.queue.mock.invocationCallOrder[0]).toBeLessThan(adapters.send.mock.invocationCallOrder[0]);
  });
  it("does not send if the signing adapter returns an empty signature", async () => {
    const adapters = { queue: vi.fn(async () => {}), block: vi.fn(async () => {}), sign: vi.fn(async () => ""), send: vi.fn(async () => {}) };
    await expect(dispatchSigned("synthetic-body", "synthetic-test-only", adapters)).rejects.toThrow("Signature unavailable");
    expect(adapters.send).not.toHaveBeenCalled();
  });
});

describe("G2 synthetic end-to-end candidate flow", () => {
  it("quarantines upload, preserves manual review, issues a short audited link, and inventories without disposal", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
    expect(validateUpload("application/pdf", bytes, bytes.length)).toEqual({ accepted: true, state: "pending_scan" });
    const uploaded = { ...doc, state: "pending_scan" as const };
    const adapters = links(); adapters.find.mockResolvedValue(uploaded);
    expect(await openDocument(staff, uploaded.id, adapters)).toEqual({ status: 404 });
    const provider = vi.fn();
    expect(await verifyIdentity(staff, uploaded, { enabled: false, legalApproved: false, processorApproved: false }, provider)).toEqual({ status: "manual_only" });
    expect(provider).not.toHaveBeenCalled();
    // Synthetic scanner outcome only; this is NOT a real parser or malware scan.
    const released = { ...uploaded, state: releaseQuarantine({ signatureValid: true, parserValid: true, malware: "clean" }) };
    const write = vi.fn(async () => {});
    expect(await reviewManually(staff, released, new Date(now).toISOString(), write)).toEqual({ status: "reviewed" });
    adapters.find.mockResolvedValue(released);
    expect((await openDocument(guest, doc.id, adapters)).status).toBe(200);
    expect(adapters.sign).toHaveBeenCalledWith(doc.path, 120);
    const disposition = cleanupAdapters();
    const counts = await runCleanup([item], policy, now, disposition, { environment: "production" });
    expect(counts.eligible).toBe(1); expect(disposition.remove).not.toHaveBeenCalled();
  });
});