import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { emitPrivilegeEscalation, emitRoleChanged } from "@/lib/fenrir/events";

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
  const { user, role: currentRole } = useAuth();

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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      toast.success("Role assigned");
      if (user) {
        emitPrivilegeEscalation(
          { userId: user.id, email: user.email, role: currentRole },
          variables.user_id,
          variables.role,
          "added"
        );
        supabase.rpc("log_staff_audit_event", {
          _event_type: "role_changed",
          _severity: "high",
          _actor_id: user.id,
          _target_user_id: variables.user_id,
          _reason: "role added",
          _metadata: { role: variables.role, action: "added" } as any,
        }).then(() => {}, () => {});
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      // Look up target before delete for audit context
      const { data: row } = await supabase
        .from("user_roles").select("user_id, role").eq("id", id).maybeSingle();
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      toast.success("Role removed");
      if (user && row) {
        supabase.rpc("log_staff_audit_event", {
          _event_type: "role_changed",
          _severity: "high",
          _actor_id: user.id,
          _target_user_id: row.user_id,
          _reason: "role removed",
          _metadata: { role: row.role, action: "removed" } as any,
        }).then(() => {}, () => {});
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createStaffAccount = useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      full_name: string;
      role: AppRole;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-account`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(payload),
        }
      );

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create account");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      toast.success("Staff account created successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { roles, addRole, removeRole, createStaffAccount };
}
