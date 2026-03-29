/**
 * Generate and download a CSV file from array of row objects.
 */
import { emitBulkGuestExport } from "@/lib/fenrir/events";

export function downloadCSV(
  rows: Record<string, string | number | null | undefined>[],
  filename: string,
  actorContext?: { userId: string; email?: string; role: any },
  includesPii = false
) {
  if (rows.length === 0) return;

  // Emit Fenrir event for bulk exports (>10 records)
  if (rows.length > 10 && actorContext) {
    emitBulkGuestExport(actorContext, rows.length, "csv", includesPii);
  }
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = String(val);
          // Escape commas and quotes
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
