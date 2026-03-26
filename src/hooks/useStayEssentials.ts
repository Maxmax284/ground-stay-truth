import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StayEssentials {
  wifi_network: string;
  wifi_password: string;
  house_rules: string;
  emergency_name: string;
  emergency_phone: string;
}

/**
 * Fetches stay essentials (WiFi, house rules, emergency contact)
 * with per-unit overrides falling back to global policy_settings.
 */
export function useStayEssentials(unitId?: string) {
  return useQuery({
    queryKey: ["stay-essentials", unitId],
    enabled: !!unitId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StayEssentials> => {
      // Fetch unit-specific + global in parallel
      const [unitRes, policiesRes] = await Promise.all([
        supabase
          .from("units")
          .select("wifi_network, wifi_password, house_rules_detail, emergency_contact_name, emergency_contact_phone")
          .eq("id", unitId!)
          .single(),
        supabase
          .from("policy_settings")
          .select("key, value")
          .in("key", [
            "wifi_network_name", "wifi_password",
            "house_rules_summary", "emergency_contact_name", "emergency_contact_phone",
          ]),
      ]);

      const unit = unitRes.data as any;
      const pMap = new Map(
        (policiesRes.data ?? []).map((p: any) => [
          p.key,
          String(p.value).replace(/^"|"$/g, ""),
        ])
      );

      return {
        wifi_network: unit?.wifi_network || pMap.get("wifi_network_name") || "",
        wifi_password: unit?.wifi_password || pMap.get("wifi_password") || "",
        house_rules: unit?.house_rules_detail || pMap.get("house_rules_summary") || "",
        emergency_name: unit?.emergency_contact_name || pMap.get("emergency_contact_name") || "Front Desk",
        emergency_phone: unit?.emergency_contact_phone || pMap.get("emergency_contact_phone") || "",
      };
    },
  });
}
