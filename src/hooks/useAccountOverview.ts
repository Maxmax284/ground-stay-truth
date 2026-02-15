import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AccountSnapshot {
  totalAccounts: number;
  totalGuests: number;
  totalStaff: number;
  totalAdmins: number;
  activeAccounts: number;
  dormantAccounts: number;
  withActiveBookings: number;
  withBookingHistory: number;
  zeroActivity: number;
}

export interface RoleDistributionItem {
  role: string;
  count: number;
}

export interface ActivityBreakdown {
  activeGuests: number;
  dormantGuests: number;
  activeStaff: number;
  dormantStaff: number;
}

export interface AccountDetail {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  lastLogin: string | null;
  hasActiveBooking: boolean;
  totalBookings: number;
  createdAt: string;
}

export interface AccountOverviewData {
  tier: "viewer" | "manager" | "admin";
  snapshot: AccountSnapshot;
  roleDistribution?: RoleDistributionItem[];
  activityBreakdown?: ActivityBreakdown;
  accounts?: AccountDetail[];
}

export function useAccountOverview() {
  return useQuery<AccountOverviewData>({
    queryKey: ["account-overview"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("account-census", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw response.error;
      return response.data as AccountOverviewData;
    },
    staleTime: 5 * 60 * 1000,
  });
}
