import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lamai-edited island guide.
 *
 * Two audiences, two queries:
 * - Guests read published entries only (`featured && is_active`), and never the
 *   internal staff notes column.
 * - Managers and admins read everything so they can review and publish.
 *
 * Nothing here invents a place. If Lamai hasn't written an entry, the guest
 * simply sees nothing — there is no fallback list of made-up businesses.
 */

/** Columns a guest is allowed to see. Staff notes stay out of guest queries. */
const GUEST_COLUMNS =
  "id,name,category,description,photos,address,maps_url,phone,whatsapp,website,opening_hours,distance_note,badges,sort_order,last_reviewed_at,closed_temporarily,seasonal_note,arrival_essential";

export interface LocalRecommendation {
  id: string;
  name: string;
  category: string;
  description: string | null;
  photos: string[];
  address: string | null;
  maps_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  opening_hours: string | null;
  distance_note: string | null;
  badges: string[];
  sort_order: number;
  last_reviewed_at: string | null;
  closed_temporarily: boolean;
  seasonal_note: string | null;
  /** Editorial flag: worth knowing about on the day you land. */
  arrival_essential: boolean;
  /** Editor-only fields. */
  featured?: boolean;
  is_active?: boolean;
  staff_notes?: string | null;
}

/** Published entries, for the guest portal. */
export function useGuestLocalRecommendations(enabled = true) {
  return useQuery({
    queryKey: ["local-recommendations", "published"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LocalRecommendation[]> => {
      const { data, error } = await supabase
        .from("local_recommendations")
        .select(GUEST_COLUMNS)
        .eq("featured", true)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LocalRecommendation[];
    },
  });
}

/** Everything, for the manager/admin editor. */
export function useAllLocalRecommendations(enabled = true) {
  return useQuery({
    queryKey: ["local-recommendations", "all"],
    enabled,
    queryFn: async (): Promise<LocalRecommendation[]> => {
      const { data, error } = await supabase
        .from("local_recommendations")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LocalRecommendation[];
    },
  });
}

export type RecommendationInput = Partial<LocalRecommendation> & {
  name: string;
  category: string;
};

export function useSaveLocalRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: RecommendationInput }) => {
      const payload = { ...values, updated_at: new Date().toISOString() };
      if (id) {
        const { error } = await supabase.from("local_recommendations").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("local_recommendations")
        .insert({ ...payload, created_by: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["local-recommendations"] }),
  });
}

/** Stamps a human review. Separate from a content edit on purpose. */
export function useMarkRecommendationReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("local_recommendations")
        .update({
          last_reviewed_at: new Date().toISOString(),
          last_reviewed_by: auth.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["local-recommendations"] }),
  });
}

/** Days since a human last checked an entry, or null if never reviewed. */
export function daysSinceReview(
  entry: Pick<LocalRecommendation, "last_reviewed_at">,
  now: Date = new Date(),
): number | null {
  if (!entry.last_reviewed_at) return null;
  const t = new Date(entry.last_reviewed_at).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** True when an entry is overdue for a human check. */
export function needsReview(
  entry: Pick<LocalRecommendation, "last_reviewed_at">,
  now: Date = new Date(),
  days = 90,
): boolean {
  const since = daysSinceReview(entry, now);
  return since === null || since > days;
}
