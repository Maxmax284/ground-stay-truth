import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface StaffPhoneRow {
  id: string;
  phone_raw: string;
  phone_e164: string;
  label: string;
  user_id: string | null;
  channel: string;
  is_active: boolean;
  created_at: string;
}

/** "+66 81 234 5678" / "0066812345678" both land on +66812345678. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return `+${digits.replace(/^00/, "")}`;
}

/** Pretty display: keep the + and group the digits loosely. */
export function formatStaffPhone(raw: string | null | undefined): string {
  const e164 = normalizePhone(raw);
  if (!e164) return "";
  const d = e164.slice(1);
  return `+${d.replace(/(\d{2,3})(?=\d)/g, "$1 ").trim()}`;
}

export function useStaffPhones() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const phones = useQuery({
    queryKey: ["staff-phones"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_phone_numbers")
        .select("id, phone_raw, phone_e164, label, user_id, channel, is_active, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffPhoneRow[];
    },
  });

  /**
   * Who already owns this number? Checks the staff directory AND personal
   * profile fields, so a manager and an admin can't register the same line.
   */
  const findDuplicate = async (
    raw: string,
    ignoreId?: string,
  ): Promise<{ where: "directory" | "profile"; label: string } | null> => {
    const e164 = normalizePhone(raw);
    if (!e164) return null;

    const { data: dir } = await supabase
      .from("staff_phone_numbers")
      .select("id, label, user_id")
      .eq("phone_e164", e164);
    const hit = (dir ?? []).find((r) => r.id !== ignoreId);
    if (hit) return { where: "directory", label: hit.label };

    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, whatsapp");
    const owner = (profs ?? []).find(
      (p) => normalizePhone(p.phone) === e164 || normalizePhone(p.whatsapp) === e164,
    );
    if (owner) {
      return { where: "profile", label: owner.full_name || "another staff account" };
    }
    return null;
  };

  const addPhone = useMutation({
    mutationFn: async (input: {
      phone_raw: string;
      label: string;
      user_id?: string | null;
      channel?: string;
    }) => {
      const dup = await findDuplicate(input.phone_raw);
      if (dup) {
        throw new Error(
          dup.where === "directory"
            ? `That number is already saved as "${dup.label}".`
            : `That number is already on ${dup.label}'s own profile.`,
        );
      }
      const { error } = await supabase.from("staff_phone_numbers").insert({
        phone_raw: input.phone_raw,
        phone_e164: normalizePhone(input.phone_raw)!,
        label: input.label,
        user_id: input.user_id ?? null,
        channel: input.channel ?? "both",
        created_by: user?.id ?? null,
      });
      if (error) {
        throw new Error(
          error.message.includes("duplicate key")
            ? "That number is already saved on the camp list."
            : error.message,
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-phones"] });
      toast.success("Number saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePhone = useMutation({
    mutationFn: async (input: { id: string; is_active?: boolean; label?: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from("staff_phone_numbers").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-phones"] });
      toast.success("Number updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePhone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_phone_numbers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-phones"] });
      toast.success("Number removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { phones, addPhone, updatePhone, removePhone, findDuplicate };
}

/**
 * Just the set of staff numbers — used by message threads to decide whether an
 * inbound text came from the camp or from a guest. Read-only.
 */
export function useStaffPhoneSet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["staff-phone-set"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_phone_numbers")
        .select("phone_e164, label, user_id")
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, { label: string; user_id: string | null }>();
      for (const r of data ?? []) map.set(r.phone_e164, { label: r.label, user_id: r.user_id });
      return map;
    },
  });
}
