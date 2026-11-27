/** Storage-independent retention candidate; adapters in G2 are synthetic only. */
export type Entry = { name: string; folder: boolean };
export async function inventory(list: (prefix: string, offset: number, limit: number) => Promise<Entry[]>, pageSize = 100): Promise<string[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  const files: string[] = [];
  const pending = [""];
  const visited = new Set<string>();
  while (pending.length) {
    const prefix = pending.shift();
    if (prefix === undefined || visited.has(prefix)) continue;
    visited.add(prefix);
    let previousPage = "";
    for (let offset = 0; ; offset += pageSize) {
      const page = await list(prefix, offset, pageSize);
      // Fail closed on a broken adapter that ignores offset instead of looping forever.
      const fingerprint = JSON.stringify(page);
      if (page.length && fingerprint === previousPage) throw new Error("Pagination did not advance");
      previousPage = fingerprint;
      for (const entry of page) {
        if (!entry.name || entry.name === "." || entry.name === ".." || /[\/\\]/.test(entry.name)) throw new Error("Invalid storage entry");
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.folder) pending.push(path);
        else files.push(path);
      }
      if (page.length < pageSize) break;
    }
  }
  return [...new Set(files)].sort();
}

export type RetentionItem = {
  id: string | null;
  path: string;
  environment: "production" | "sandbox";
  held: boolean;
  referenced: boolean;
  createdAt: string;
  checkout: string | null;
  bookingState: string | null;
};
export type RetentionPolicy = { approved: boolean; retainedDays: number; orphanDays: number; reviewDue: string };
export function classify(item: RetentionItem, policy: RetentionPolicy | null, now: number) {
  if (item.held) return "held" as const;
  if (!policy?.approved || !Number.isFinite(policy.retainedDays) || policy.retainedDays < 1 || !Number.isFinite(policy.orphanDays) || policy.orphanDays < 1 || !Number.isFinite(Date.parse(policy.reviewDue)) || Date.parse(policy.reviewDue) <= now) return "policy_required" as const;
  if (item.referenced && !["completed", "cancelled"].includes(item.bookingState ?? "")) return "keep" as const;
  const date = item.referenced ? item.checkout : item.createdAt;
  if (!date || !Number.isFinite(Date.parse(date))) return "unknown" as const;
  const days = item.referenced ? policy.retainedDays : policy.orphanDays;
  return now - Date.parse(date) > days * 86400000 ? "eligible" as const : "keep" as const;
}

type Audit = { id: string | null; stage: "planned" | "removed" | "failed"; code?: string };
export type CleanupAdapters = {
  audit: (event: Audit) => Promise<void>;
  recheck: (item: RetentionItem) => Promise<RetentionItem>;
  remove: (path: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  deleteRow: (id: string) => Promise<void>;
};
export async function runCleanup(items: RetentionItem[], policy: RetentionPolicy | null, now: number, adapters: CleanupAdapters, options: {
  mode?: "dry_run" | "dispose";
  environment: "production" | "sandbox";
  disposalApproved?: boolean;
  maxBatch?: number;
}) {
  const counts = { found: items.length, held: 0, eligible: 0, policyRequired: 0, unknown: 0, kept: 0, outsideEnvironment: 0, removed: 0, failed: 0 };
  const dispose = options.mode === "dispose";
  if (dispose && (!options.disposalApproved || !Number.isInteger(options.maxBatch) || (options.maxBatch ?? 0) < 1)) throw new Error("Separate disposal approval and bounded batch required");
  let attempted = 0;
  for (const item of items) {
    if (item.environment !== options.environment) { counts.outsideEnvironment++; continue; }
    const state = classify(item, policy, now);
    if (state === "held") { counts.held++; continue; }
    if (state === "policy_required") { counts.policyRequired++; continue; }
    if (state === "unknown") { counts.unknown++; continue; }
    if (state === "keep") { counts.kept++; continue; }
    counts.eligible++;
    if (!dispose || attempted >= (options.maxBatch ?? 0)) continue;
    attempted++;
    try {
      // Evidence must be durable before any removal attempt.
      await adapters.audit({ id: item.id, stage: "planned" });
      const current = await adapters.recheck(item);
      if (current.path !== item.path || current.environment !== options.environment || classify(current, policy, now) !== "eligible") { counts.kept++; continue; }
      await adapters.remove(item.path);
      if (await adapters.exists(item.path)) throw new Error("Removal unconfirmed");
      if (item.id) await adapters.deleteRow(item.id);
      await adapters.audit({ id: item.id, stage: "removed" });
      counts.removed++;
    } catch {
      counts.failed++;
      // Do not emit provider errors or paths (may contain PII).
      await adapters.audit({ id: item.id, stage: "failed", code: "disposition_failed" });
      // Stop after partial failure; reconcile before resuming a destructive batch.
      break;
    }
  }
  return counts;
}