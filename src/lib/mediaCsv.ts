/**
 * Media Library CSV export.
 * Plain spreadsheet inventory: filename, upload date, uploader, in-use flag.
 */
import { supabase } from "@/integrations/supabase/client";

export type MediaCsvRow = {
  original_filename: string | null;
  storage_path: string;
  folder: string;
  created_at: string;
  uploaded_by: string | null;
  usedBy: string[];
};

const esc = (value: unknown) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Resolve uploader ids to human names (falls back to the raw id). */
export async function fetchUploaderNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  for (const p of data ?? []) {
    map.set(p.id, (p.full_name || p.email || p.id) as string);
  }
  return map;
}

export function buildMediaCsv(rows: MediaCsvRow[], uploaders: Map<string, string>): string {
  const header = [
    "Filename",
    "Folder",
    "Upload date",
    "Uploader",
    "In use",
    "Used by",
    "Storage path",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const inUse = r.usedBy.length > 0;
    lines.push(
      [
        esc(r.original_filename || r.storage_path.split("/").pop() || ""),
        esc(r.folder),
        esc(new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })),
        esc(r.uploaded_by ? uploaders.get(r.uploaded_by) ?? r.uploaded_by : "Unknown"),
        inUse ? "Yes" : "No",
        esc(r.usedBy.join("; ")),
        esc(r.storage_path),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  // BOM keeps Excel happy with non-ASCII names.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
