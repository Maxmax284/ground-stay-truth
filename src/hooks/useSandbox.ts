/**
 * useSandbox — Sandbox / practice-camp control.
 *
 * The sandbox is a real property row flagged `is_sandbox`. Everything hanging off
 * it (units, bookings, payments, pickups) is fake, and the platform refuses to
 * send emails, admin alerts or Stripe payment links for it.
 *
 * BUSINESS-CRITICAL: reset_sandbox() only ever touches rows scoped to the
 * sandbox property. Live camp data is never in range.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SandboxStatus {
  propertyId: string | null;
  name: string | null;
  units: number;
  bookings: number;
}

export function useSandbox() {
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["sandbox-status"],
    queryFn: async (): Promise<SandboxStatus> => {
      const { data: prop, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("slug", "sandbox")
        .maybeSingle();
      if (error) throw error;
      if (!prop) return { propertyId: null, name: null, units: 0, bookings: 0 };

      const [{ count: units }, { count: bookings }] = await Promise.all([
        supabase
          .from("units")
          .select("id", { count: "exact", head: true })
          .eq("property_id", prop.id),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("property_id", prop.id),
      ]);

      return {
        propertyId: prop.id,
        name: prop.name,
        units: units ?? 0,
        bookings: bookings ?? 0,
      };
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reset_sandbox" as any);
      if (error) throw error;
      // The sandbox is a real property, so the person who reset it also needs an
      // assignment to it — otherwise the practice toggle can see the camp exists
      // but cannot switch into it.
      const { error: assignError } = await supabase.rpc("assign_sandbox_to_caller" as any);
      if (assignError) throw assignError;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sandbox-status"] });
      // Refresh property access so the sandbox appears in the switcher immediately.
      queryClient.invalidateQueries({ queryKey: ["user_property_assignments"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
  });

  return { status, reset };
}

/** Reusable practice scenarios seeded by reset_sandbox(). */
export const SANDBOX_SCENARIOS: { name: string; guest: string; what: string }[] = [
  {
    name: "Clean extension",
    guest: "SB Somchai Extend",
    what: "Checked in, same room stays free — extend the stay and collect the difference.",
  },
  {
    name: "Extension needs a move",
    guest: "SB Anna Blocked",
    what: "Room is booked right after checkout — extending forces a relocation to another villa.",
  },
  {
    name: "Upgrade / downgrade",
    guest: "SB Upgrade Candidate",
    what: "Confirmed twin room — move to a villa mid-stay, or downgrade and create a credit.",
  },
  {
    name: "Pay on arrival",
    guest: "SB Pay On Arrival",
    what: "Should never show as payment overdue. Use to sanity-check the money warnings.",
  },
  {
    name: "Month crossing stay",
    guest: "SB Month Crosser",
    what: "Stay spans the end of the month — check pricing rules and reporting split.",
  },
];
