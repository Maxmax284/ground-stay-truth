/**
 * Operational shortcut chips — one tap, compact answer, on-page spotlight.
 *
 * A shortcut never navigates and never opens a panel. It sends a short prompt
 * to Kru Glitch and spotlights the matching rows that are ALREADY rendered on
 * the current page. Matching is driven by the `data-spotlight-tags` attribute
 * the pages put on their existing rows, so this layer needs no data access of
 * its own and stays inside the caller's permissions.
 */

import type { SpotlightKind } from "@/lib/spotlightStore";

export type ShortcutKey =
  | "check_ins_today"
  | "check_outs_today"
  | "payments_due"
  | "unpaid_balances"
  | "missing_documents"
  | "housekeeping_today"
  | "airport_pickups_today"
  | "open_maintenance"
  | "needs_attention";

export interface ShortcutDef {
  key: ShortcutKey;
  label: string;
  prompt: string;
  kind: SpotlightKind;
  /** Row tag(s) that mark a matching record on the page. */
  tags: string[];
  /** Where to look if nothing matches on this page. */
  whereToLook: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    key: "check_ins_today",
    label: "Check-ins today",
    prompt: "Who's checking in today?",
    kind: "booking",
    tags: ["check_in_today"],
    whereToLook: "Front Desk",
  },
  {
    key: "check_outs_today",
    label: "Check-outs today",
    prompt: "Who's checking out today?",
    kind: "booking",
    tags: ["check_out_today"],
    whereToLook: "Front Desk",
  },
  {
    key: "payments_due",
    label: "Payments due",
    prompt: "Which bookings have payments due?",
    kind: "booking",
    tags: ["balance_due"],
    whereToLook: "Payments",
  },
  {
    key: "unpaid_balances",
    label: "Unpaid balances",
    prompt: "Who owes money right now?",
    kind: "booking",
    tags: ["balance_due"],
    whereToLook: "Payments",
  },
  {
    key: "missing_documents",
    label: "Missing documents",
    prompt: "Who needs a passport or ID upload?",
    kind: "booking",
    tags: ["missing_documents"],
    whereToLook: "Front Desk",
  },
  {
    key: "housekeeping_today",
    label: "Housekeeping today",
    prompt: "What needs cleaning today?",
    kind: "task",
    tags: ["housekeeping_today"],
    whereToLook: "Front Desk",
  },
  {
    key: "airport_pickups_today",
    label: "Airport pickups",
    prompt: "What pickups are today?",
    kind: "pickup",
    tags: ["pickup_today"],
    whereToLook: "Front Desk",
  },
  {
    key: "open_maintenance",
    label: "Open maintenance",
    prompt: "What's broken right now?",
    kind: "maintenance",
    tags: ["maintenance_open"],
    whereToLook: "Units",
  },
  {
    key: "needs_attention",
    label: "Needs attention",
    prompt: "What needs attention today?",
    kind: "booking",
    tags: ["needs_attention"],
    whereToLook: "Front Desk",
  },
];

export function getShortcut(key: ShortcutKey): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.key === key);
}

export interface SpotlightRow {
  id: string;
  kind: string;
  tags: string[];
}

/** Pure matcher — rows come from the page, tags come from the shortcut. */
export function resolveShortcutTargets(shortcut: ShortcutDef, rows: SpotlightRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.kind !== shortcut.kind) continue;
    if (!shortcut.tags.some((tag) => row.tags.includes(tag))) continue;
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return ids;
}

/** Reads the spotlight-tagged rows currently rendered on the page. */
export function collectSpotlightRows(root: ParentNode = document): SpotlightRow[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-spotlight-id][data-spotlight-kind]"));
  return nodes.map((el) => ({
    id: el.getAttribute("data-spotlight-id") ?? "",
    kind: el.getAttribute("data-spotlight-kind") ?? "",
    tags: (el.getAttribute("data-spotlight-tags") ?? "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean),
  })).filter((r) => r.id);
}
