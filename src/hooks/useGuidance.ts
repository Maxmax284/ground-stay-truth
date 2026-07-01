/**
 * useGuidance — single source of truth for tooltip + page-help + (future) AI grounding.
 *
 * - Fetches an approved guidance entry by key.
 * - Filters by the caller's role client-side (server RLS also gates non-approved rows).
 * - Enforces tone safety on the client too (defense in depth):
 *     risk_level='high' -> neutral
 *     guest_visible=true and tone not in (neutral,friendly) -> friendly
 * - `preview=true` allows admin/manager UIs to fetch draft/archived entries.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type GuidanceTone = "neutral" | "friendly" | "dry_humor" | "thai_east_coast";
export type GuidanceRisk = "low" | "medium" | "high";
export type GuidanceStatus = "draft" | "approved" | "archived";

export interface GuidanceEntry {
  id: string;
  key: string;
  feature_name: string;
  section: string | null;
  route: string | null;
  short_tooltip: string;
  page_help: string | null;
  detailed_explanation: string | null;
  used_for: string[];
  not_used_for: string[];
  common_tasks: string[];
  step_by_step: Array<{ step: string }>;
  warnings: string[];
  related_keys: string[];
  roles_allowed: string[];
  tone: GuidanceTone;
  risk_level: GuidanceRisk;
  guest_visible: boolean;
  internal_only: boolean;
  status: GuidanceStatus;
  ai_prompt_suggestions: string[];
  updated_at: string;
}

function enforceTone(entry: GuidanceEntry): GuidanceEntry {
  let tone = entry.tone;
  if (entry.risk_level === "high") tone = "neutral";
  else if (entry.guest_visible && tone !== "neutral" && tone !== "friendly") tone = "friendly";
  return tone === entry.tone ? entry : { ...entry, tone };
}

export function useGuidance(key: string | null | undefined, opts?: { preview?: boolean }) {
  const { role } = useAuth();

  return useQuery({
    queryKey: ["platform_guidance", key, opts?.preview ? "preview" : "prod", role ?? "anon"],
    enabled: !!key,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GuidanceEntry | null> => {
      if (!key) return null;
      const q = supabase
        .from("platform_guidance" as any)
        .select("*")
        .eq("key", key)
        .limit(1);
      if (!opts?.preview) q.eq("status", "approved");
      const { data, error } = await q.maybeSingle();
      if (error) return null;
      if (!data) return null;
      const entry = data as unknown as GuidanceEntry;

      // Client-side role gate (server RLS + status filter already narrows).
      if (role && entry.roles_allowed?.length && !entry.roles_allowed.includes(role)) {
        return null;
      }
      return enforceTone(entry);
    },
  });
}
