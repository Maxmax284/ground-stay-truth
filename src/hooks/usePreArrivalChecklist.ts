import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── SECTIONS & ITEMS ────────────────────────────────────────────────────────

export interface ChecklistSection {
  id: string;
  label: string;
  items: readonly ChecklistItemDef[];
  /** If true, at least one item in this section is critical for system confidence */
  hasCritical?: boolean;
}

export interface ChecklistItemDef {
  key: string;
  label: string;
  /** Plain-English explanation of why this matters */
  why: string;
  /** Whether this item is critical for arrival system confidence */
  critical?: boolean;
  /** Item type determines UI treatment */
  type?: "toggle" | "input" | "info";
  /** Optional external link for the guest to complete this step */
  link?: { url: string; label: string };
}

const TRAVEL_INFO: readonly ChecklistItemDef[] = [
  {
    key: "confirm_arrival_time",
    label: "Confirm arrival time",
    why: "We need your arrival time to coordinate your pickup and check-in.",
    critical: true,
  },
  {
    key: "confirm_domestic_flight",
    label: "Add your Samui flight (if connecting from Bangkok)",
    why: "Without your domestic flight, we can't time your pickup at Samui airport.",
    critical: true,
  },
  {
    key: "international_flight_noted",
    label: "Confirm international flight details",
    why: "Helps us track your journey and anticipate arrival timing.",
  },
] as const;

const ARRIVAL_REQUIREMENTS: readonly ChecklistItemDef[] = [
  {
    key: "tdac_completed",
    label: "Complete Thailand Digital Arrival Card (TDAC)",
    why: "Required within 72 hours before landing — you won't clear immigration without it.",
    critical: true,
  },
  {
    key: "upload_id",
    label: "Upload ID / Passport",
    why: "Immigration requires a valid passport. We also need a copy for check-in.",
    critical: true,
  },
  {
    key: "accommodation_confirmed",
    label: "Know your accommodation details for immigration",
    why: "Immigration may ask where you're staying. We'll provide the address if you need it.",
    type: "info",
  },
] as const;

const CONNECTIVITY: readonly ChecklistItemDef[] = [
  {
    key: "connectivity_readiness",
    label: "Confirm you have internet when you land (SIM, eSIM, or roaming)",
    why: "Without internet, we can't guide your pickup, send messages, or confirm your arrival. This is the most common cause of communication breakdowns.",
    critical: true,
  },
] as const;

const LOCAL_SETUP: readonly ChecklistItemDef[] = [
  {
    key: "money_awareness",
    label: "Review cash & ATM expectations",
    why: "Thailand is partially cash-based. ATMs charge 220฿ per withdrawal. Cards accepted at some shops, not all.",
    type: "info",
  },
  {
    key: "transport_awareness",
    label: "Understand how pickup works after landing",
    why: "Your driver will meet you at the airport. Confirmation requires connectivity — make sure you're reachable.",
    type: "info",
  },
] as const;

const SAFETY_PREP: readonly ChecklistItemDef[] = [
  {
    key: "insurance_awareness",
    label: "Travel or health insurance (recommended)",
    why: "Medical costs in Thailand can be high. Insurance is strongly recommended, especially for training stays.",
  },
  {
    key: "driving_awareness",
    label: "International driving permit (if planning to ride)",
    why: "Riding without an international permit is illegal in Thailand. Accidents without one void most insurance.",
    type: "info",
  },
  {
    key: "emergency_contact",
    label: "Emergency contact confirmation",
    why: "We need a contact who can be reached if something happens during your stay.",
  },
] as const;

const LIVING_AT_LAMAI: readonly ChecklistItemDef[] = [
  {
    key: "camp_rules_ack",
    label: "Review how things work at Lamai",
    why: "WiFi, gym schedule, reception hours, housekeeping, laundry, electricity, and a few practical things to know before you arrive.",
  },
] as const;

export const CHECKLIST_SECTIONS: readonly ChecklistSection[] = [
  { id: "travel", label: "Travel Info", items: TRAVEL_INFO, hasCritical: true },
  { id: "arrival", label: "Arrival Requirements", items: ARRIVAL_REQUIREMENTS, hasCritical: true },
  { id: "connectivity", label: "Connectivity (Critical)", items: CONNECTIVITY, hasCritical: true },
  { id: "local", label: "Local Setup", items: LOCAL_SETUP },
  { id: "safety", label: "Safety & Prep", items: SAFETY_PREP },
  { id: "living", label: "Living at Lamai", items: LIVING_AT_LAMAI },
] as const;

/** Flat list of all items for backward compatibility */
export const CHECKLIST_ITEMS = CHECKLIST_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({ key: i.key, label: i.label }))
);

/** All critical item keys */
export const CRITICAL_ITEMS = CHECKLIST_SECTIONS.flatMap((s) =>
  s.items.filter((i) => i.critical).map((i) => i.key)
);

export type ChecklistItemKey = string;

export interface ChecklistItem {
  id: string;
  booking_id: string;
  item_key: string;
  completed: boolean;
  completed_at: string | null;
  data: any;
  created_at: string;
  updated_at: string;
}

export function usePreArrivalChecklist(bookingId: string | null) {
  return useQuery({
    queryKey: ["pre_arrival_checklist", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pre_arrival_checklist")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("item_key");
      if (error) throw error;
      return data as ChecklistItem[];
    },
  });
}

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      itemKey,
      completed,
      data,
    }: {
      bookingId: string;
      itemKey: string;
      completed: boolean;
      data?: any;
    }) => {
      const { error } = await supabase
        .from("pre_arrival_checklist")
        .upsert(
          {
            booking_id: bookingId,
            item_key: itemKey,
            completed,
            completed_at: completed ? new Date().toISOString() : null,
            data: data ?? null,
          },
          { onConflict: "booking_id,item_key" }
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pre_arrival_checklist", vars.bookingId] });
    },
  });
}

export function getChecklistProgress(items: ChecklistItem[] | undefined): {
  completed: number;
  total: number;
  percentage: number;
  isComplete: boolean;
  criticalCompleted: number;
  criticalTotal: number;
  criticalMissing: string[];
} {
  const allItems = CHECKLIST_SECTIONS.flatMap((s) => s.items);
  const total = allItems.length;
  const completed = allItems.filter((ci) =>
    items?.some((i) => i.item_key === ci.key && i.completed)
  ).length;

  const criticalTotal = CRITICAL_ITEMS.length;
  const criticalMissing = CRITICAL_ITEMS.filter(
    (key) => !items?.some((i) => i.item_key === key && i.completed)
  );
  const criticalCompleted = criticalTotal - criticalMissing.length;

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    isComplete: completed === total,
    criticalCompleted,
    criticalTotal,
    criticalMissing,
  };
}

/** Get human-readable label for a checklist item key */
export function getItemLabel(key: string): string {
  for (const section of CHECKLIST_SECTIONS) {
    const item = section.items.find((i) => i.key === key);
    if (item) return item.label;
  }
  return key;
}
