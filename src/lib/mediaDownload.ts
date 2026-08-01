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

/** Download one asset with its original filename. */
export async function downloadSingleAsset(asset: DownloadableAsset): Promise<void> {
  const res = await fetch(asset.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch file (${res.status})`);
  triggerBlobDownload(await res.blob(), assetFilename(asset));
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

export type ZipProgress = { done: number; total: number; phase: "fetching" | "zipping" };

/**
 * Fetch every asset (batched, 5 at a time) and download a single zip,
 * organized into folders that mirror the media library folders.
 */
export async function downloadAssetsAsZip(
  assets: DownloadableAsset[],
  zipName: string,
  onProgress?: (p: ZipProgress) => void,
): Promise<{ added: number; failed: string[] }> {
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  let added = 0;
  let done = 0;
  const total = assets.length;

  const BATCH = 5;
  for (let i = 0; i < assets.length; i += BATCH) {
    const batch = assets.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (asset) => {
        try {
          const res = await fetch(asset.url, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          const path = uniquePath(used, `${sanitizeFolder(asset.folder)}/${assetFilename(asset)}`);
          zip.file(path, blob);
          added += 1;
        } catch {
          failed.push(assetFilename(asset));
        } finally {
          done += 1;
          onProgress?.({ done, total, phase: "fetching" });
        }
      }),
    );
  }

  if (added === 0) return { added, failed };

  onProgress?.({ done, total, phase: "zipping" });
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  triggerBlobDownload(blob, zipName);
  return { added, failed };
}

/** `lmt-media-2026-08-01.zip` style names. */
export function zipFilename(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "media";
  return `lmt-media-${slug}-${new Date().toISOString().slice(0, 10)}.zip`;
}
