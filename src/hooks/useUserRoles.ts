import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile_name: string | null;
  profile_email: string | null;
}

export function useUserRoles() {
  const qc = useQueryClient();

  const roles = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch profiles for these user_ids
      const userIds = [...new Set(roleRows.map((r) => r.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : { data: [] };

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return roleRows.map((r): UserRoleRow => ({
        ...r,
        profile_name: profileMap.get(r.user_id)?.full_name ?? null,
        profile_email: profileMap.get(r.user_id)?.email ?? null,
      }));
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      toast.success("Role assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      toast.success("Role removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { roles, addRole, removeRole };
}
