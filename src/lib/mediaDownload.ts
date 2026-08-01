/**
 * Media Library download helpers.
 *
 * Single-file downloads go through a blob fetch + object URL (not a bare
 * `<a href>`), so they save properly inside PWA / in-app browsers instead of
 * navigating the whole app away. Bulk downloads are zipped client-side with
 * JSZip, grouped by media-library folder.
 */
import JSZip from "jszip";

export type DownloadableAsset = {
  url: string;
  storage_path: string;
  original_filename?: string | null;
  folder?: string | null;
};

/** Safe, readable filename for an asset. */
export function assetFilename(a: DownloadableAsset): string {
  const raw = a.original_filename?.trim() || a.storage_path.split("/").pop() || "photo";
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return cleaned || "photo";
}

function sanitizeFolder(folder?: string | null): string {
  const f = (folder || "Uncategorized").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return f || "Uncategorized";
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give Safari/WebView a beat before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Permanent failures (file deleted / no access) must not burn retry time. */
class PermanentFetchError extends Error {
  constructor(public status: number) {
    super(status === 404 || status === 400 ? "File is missing from storage" : `HTTP ${status}`);
    this.name = "PermanentFetchError";
  }
}

/**
 * Fetch a file with graceful retry: 3 attempts, 400ms → 800ms → 1.6s backoff.
 * Flaky mobile/hotel wifi is the norm here, so a single blip must not kill a
 * 100-photo zip. 4xx responses are permanent — they fail immediately instead of
 * stalling the whole batch for ~3s per dead file.
 */
async function fetchBlobWithRetry(
  url: string,
  opts: { attempts?: number; signal?: AbortSignal; onAttempt?: (attempt: number) => void } = {},
): Promise<Blob> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      opts.onAttempt?.(i + 1);
      const res = await fetch(url, { cache: "no-store", signal: opts.signal });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) throw new PermanentFetchError(res.status);
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.blob();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      if (e instanceof PermanentFetchError) throw e;
      lastErr = e;
      if (i < attempts - 1) await sleep(400 * Math.pow(2, i));
    }
  }
  throw new Error(`Could not fetch file (${lastErr instanceof Error ? lastErr.message : "network error"})`);
}


export type SingleProgress = { phase: "fetching" | "saving"; attempt: number; attempts: number };

/** Download one asset with its original filename, retrying transient failures. */
export async function downloadSingleAsset(
  asset: DownloadableAsset,
  onProgress?: (p: SingleProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const attempts = 3;
  const blob = await fetchBlobWithRetry(asset.url, {
    attempts,
    signal,
    onAttempt: (attempt) => onProgress?.({ phase: "fetching", attempt, attempts }),
  });
  onProgress?.({ phase: "saving", attempt: attempts, attempts });
  triggerBlobDownload(blob, assetFilename(asset));
}

/** Ensure names are unique inside the zip. */
function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) { used.add(path); return path; }
  const dot = path.lastIndexOf(".");
  const base = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  let i = 2;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) { i += 1; candidate = `${base} (${i})${ext}`; }
  used.add(candidate);
  return candidate;
}

export type ZipProgress = {
  done: number;
  total: number;
  /** `fetching` → pulling files, `zipping` → compressing, `saving` → handing to the browser. */
  phase: "fetching" | "zipping" | "saving";
  /** Files that failed all retries so far. */
  failed: number;
  /** Retry pass number (0 = first run). */
  pass: number;
  /** Zip build percentage while `phase === "zipping"`. */
  zipPercent?: number;
};

export type ZipResult = {
  added: number;
  /** Assets that failed every retry — hand these straight back into a retry pass. */
  failedAssets: DownloadableAsset[];
  aborted: boolean;
};

/**
 * Fetch every asset (batched, 5 at a time, each with retry) and download a
 * single zip organized into folders that mirror the media library folders.
 * Reports fetch progress, zip-build progress and failure counts as it goes.
 */
export async function downloadAssetsAsZip(
  assets: DownloadableAsset[],
  zipName: string,
  onProgress?: (p: ZipProgress) => void,
  opts: { signal?: AbortSignal; pass?: number } = {},
): Promise<ZipResult> {
  const zip = new JSZip();
  const used = new Set<string>();
  const failedAssets: DownloadableAsset[] = [];
  const pass = opts.pass ?? 0;
  let added = 0;
  let done = 0;
  const total = assets.length;
  const report = (phase: ZipProgress["phase"], zipPercent?: number) =>
    onProgress?.({ done, total, phase, failed: failedAssets.length, pass, zipPercent });

  const BATCH = 5;
  for (let i = 0; i < assets.length; i += BATCH) {
    if (opts.signal?.aborted) return { added, failedAssets, aborted: true };
    const batch = assets.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (asset) => {
        try {
          const blob = await fetchBlobWithRetry(asset.url, { signal: opts.signal });
          const path = uniquePath(used, `${sanitizeFolder(asset.folder)}/${assetFilename(asset)}`);
          zip.file(path, blob);
          added += 1;
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") failedAssets.push(asset);
        } finally {
          done += 1;
          report("fetching");
        }
      }),
    );
  }

  if (opts.signal?.aborted) return { added, failedAssets, aborted: true };
  if (added === 0) return { added, failedAssets, aborted: false };

  report("zipping", 0);
  const blob = await zip.generateAsync(
    { type: "blob", compression: "STORE" },
    (meta) => report("zipping", Math.round(meta.percent)),
  );
  report("saving");
  triggerBlobDownload(blob, zipName);
  return { added, failedAssets, aborted: false };
}

/** `lmt-media-2026-08-01.zip` style names. */
export function zipFilename(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "media";
  return `lmt-media-${slug}-${new Date().toISOString().slice(0, 10)}.zip`;
}
