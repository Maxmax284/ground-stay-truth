import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type IntelligenceType = "heads_up" | "playbook";
export type IntelligenceStatus = "draft" | "active" | "archived";
export type IntelligenceCategory = "money" | "transport" | "safety" | "connectivity" | "customs" | "health" | "local_life";
export type IntelligenceSeverity = "urgent" | "attention" | "normal";
export type IntelligenceLocation = "bkk" | "samui" | "nathon" | "lipa_noi" | "bus" | "island" | "global" | "phuket" | "pattaya" | "transit";

export interface IntelligenceEntry {
  id: string;
  type: IntelligenceType;
  status: IntelligenceStatus;
  title: string;
  body: string;
  location: string[];
  category: IntelligenceCategory;
  audience: string[];
  severity: IntelligenceSeverity;
  image_url: string | null;
  image_caption: string | null;
  sort_order: number;
  expires_at: string | null;
  promoted_from: string | null;
  created_by: string | null;
  approved_by: string | null;
  property_id: string | null;
  translations: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

interface UseIntelligenceOptions {
  type?: IntelligenceType;
  locations?: string[];
  status?: IntelligenceStatus;
}

export function useIntelligence(options: UseIntelligenceOptions = {}) {
  const { role } = useAuth();

  return useQuery<IntelligenceEntry[]>({
    queryKey: ["intelligence", options.type, options.status, options.locations],
    queryFn: async () => {
      let query = supabase
        .from("intelligence_entries")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (options.type) query = query.eq("type", options.type);
      if (options.status) query = query.eq("status", options.status);

      const { data, error } = await query;
      if (error) throw error;

      let entries = (data ?? []) as unknown as IntelligenceEntry[];

      // Client-side: filter expired heads_up
      const now = new Date().toISOString();
      entries = entries.filter((e) => !e.expires_at || e.expires_at > now);

      // Client-side: filter by location if requested
      if (options.locations?.length) {
        entries = entries.filter((e) =>
          e.location?.some((loc) => options.locations!.includes(loc) || loc === "global")
        );
      }

      return entries;
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!role,
  });
}

export function useIntelligenceMutations() {
  const queryClient = useQueryClient();

  const upsert = useMutation({
    mutationFn: async (entry: Partial<IntelligenceEntry> & { id?: string }) => {
      if (entry.id) {
        const { data, error } = await supabase
          .from("intelligence_entries")
          .update(entry as any)
          .eq("id", entry.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("intelligence_entries")
          .insert(entry as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("intelligence_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence"] }),
  });

  const promote = useMutation({
    mutationFn: async (headsUpId: string) => {
      // Fetch the heads_up entry
      const { data: source, error: fetchErr } = await supabase
        .from("intelligence_entries")
        .select("*")
        .eq("id", headsUpId)
        .single();
      if (fetchErr || !source) throw fetchErr || new Error("Not found");

      const s = source as unknown as IntelligenceEntry;

      // Create playbook entry
      const { error: insertErr } = await supabase.from("intelligence_entries").insert({
        type: "playbook",
        status: "active",
        title: s.title,
        body: s.body,
        location: s.location,
        category: s.category,
        audience: s.audience,
        severity: "normal",
        image_url: s.image_url,
        image_caption: s.image_caption,
        promoted_from: headsUpId,
        created_by: s.created_by,
        approved_by: s.approved_by,
        property_id: s.property_id,
      } as any);
      if (insertErr) throw insertErr;

      // Archive the heads_up
      const { error: archiveErr } = await supabase
        .from("intelligence_entries")
        .update({ status: "archived" } as any)
        .eq("id", headsUpId);
      if (archiveErr) throw archiveErr;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence"] }),
  });

  return { upsert, remove, promote };
}
