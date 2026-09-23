import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Standing daily ceiling on paid flight reads — mirrors the edge constant. */
export const DAILY_PAID_READ_CEILING = 25;

export interface FlightReadRow {
  id: string;
  created_at: string;
  provider: string;
  flight_key: string | null;
  outcome: string;
  http_status: number | null;
}

export interface FlightBudgetGrant {
  id: string;
  extra_reads: number;
  reason: string;
  created_at: string;
}

export interface FlightBudget {
  day: string;
  used: number;
  base: number;
  grantedExtra: number;
  allowed: number;
  remaining: number;
  reads: FlightReadRow[];
  grants: FlightBudgetGrant[];
}

/** Never negative; mirrors the edge cap math so the dashboard cannot lie. */
export function remainingPaidReads(base: number, grantedExtra: number, used: number): number {
  return Math.max(0, base + Math.max(0, grantedExtra) - Math.max(0, used));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function useFlightBudget(enabled = true) {
  return useQuery({
    queryKey: ["flight-budget", today()],
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async (): Promise<FlightBudget> => {
      const day = today();
      const [readsRes, grantsRes] = await Promise.all([
        supabase
          .from("flight_provider_reads")
          .select("id, created_at, provider, flight_key, outcome, http_status")
          .eq("read_day", day)
          .eq("paid", true)
          .order("created_at", { ascending: false }),
        (supabase.from("flight_budget_grants" as any) as any)
          .select("id, extra_reads, reason, created_at")
          .eq("read_day", day)
          .order("created_at", { ascending: false }),
      ]);
      if (readsRes.error) throw readsRes.error;
      if (grantsRes.error) throw grantsRes.error;

      const reads = (readsRes.data ?? []) as unknown as FlightReadRow[];
      const grants = (grantsRes.data ?? []) as FlightBudgetGrant[];
      const grantedExtra = grants.reduce((n, g) => n + (Number(g.extra_reads) || 0), 0);
      const used = reads.length;
      return {
        day,
        used,
        base: DAILY_PAID_READ_CEILING,
        grantedExtra,
        allowed: DAILY_PAID_READ_CEILING + grantedExtra,
        remaining: remainingPaidReads(DAILY_PAID_READ_CEILING, grantedExtra, used),
        reads,
        grants,
      };
    },
  });
}

/** Admin-only, today-only top-up. RLS enforces the role; tomorrow returns to 25. */
export function useGrantFlightBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ extra_reads, reason }: { extra_reads: number; reason: string }) => {
      const trimmed = reason.trim();
      if (!Number.isInteger(extra_reads) || extra_reads < 1 || extra_reads > 200) {
        throw new Error("Enter between 1 and 200 extra reads.");
      }
      if (trimmed.length < 3) throw new Error("Give a short reason for the top-up.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Sign in again to top up the budget.");
      const { error } = await (supabase.from("flight_budget_grants" as any) as any).insert({
        extra_reads,
        reason: trimmed,
        granted_by: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flight-budget"] }),
  });
}
