import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type AvailabilityResult,
  type AvailabilityStatus,
  logAvailability,
} from "@/lib/availability/types";

/**
 * Classify a thrown/returned error from supabase.functions.invoke.
 * We can't always tell network from server perfectly in the browser, but
 * we can get close using error name/message heuristics.
 */
function classifyInvokeError(err: unknown): AvailabilityStatus {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "network_error";
  }
  const msg = String((err as any)?.message ?? err ?? "").toLowerCase();
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("cors") ||
    msg.includes("abort") ||
    msg.includes("timeout")
  ) {
    return "network_error";
  }
  if (msg.includes("jwt") || msg.includes("unauthor") || msg.includes("forbidden")) {
    return "server_error";
  }
  return "server_error";
}

function classifyRpcError(err: unknown): AvailabilityStatus {
  const msg = String((err as any)?.message ?? err ?? "").toLowerCase();
  if (msg.includes("permission") || msg.includes("policy") || msg.includes("jwt")) {
    return "server_error";
  }
  if (msg.includes("invalid arguments")) {
    return "configuration_error";
  }
  return classifyInvokeError(err);
}

/**
 * Availability check with proper failure classification.
 *
 * Flow:
 *   1. Call edge function `auto-assign-unit`.
 *   2. If edge succeeds AND payload has expected shape → return.
 *   3. Otherwise fall back to `assign_unit_for_group` RPC (same authoritative
 *      picker the submit path uses).
 *   4. If BOTH fail → return a categorized error result (never throws).
 *
 * The hook NEVER throws — every failure is expressed as a status on the
 * result object so the UI can pick the right message and decide whether
 * to show a retry button.
 */
export function useAutoAssignUnit(
  groupId: string | undefined,
  checkIn: string,
  checkOut: string,
) {
  return useQuery<AvailabilityResult>({
    queryKey: ["auto-assign-unit", groupId, checkIn, checkOut],
    enabled: !!groupId && !!checkIn && !!checkOut,
    staleTime: 10_000,
    retry: false, // we do our own fallback + surface errors as data
    queryFn: async () => {
      const payload = {
        group_id: groupId,
        check_in: checkIn,
        check_out: checkOut,
      };

      // -------- Attempt 1: edge function --------
      let edgeError: unknown = null;
      let edgeMalformed = false;
      try {
        const { data, error } = await supabase.functions.invoke(
          "auto-assign-unit",
          { body: payload },
        );
        if (!error && data && typeof data === "object" && "available" in data) {
          const d = data as {
            available: boolean;
            unit_id?: string;
            unit_name?: string;
            available_count?: number;
            total_count?: number;
          };
          // Zero-active-unit group is a config issue, not a real conflict.
          if (!d.available && (d.total_count ?? 0) === 0) {
            const result: AvailabilityResult = {
              status: "configuration_error",
              available_count: 0,
              total_count: 0,
              source: "edge_function",
              fallback_attempted: false,
              fallback_succeeded: false,
              debug: "edge returned total_count=0",
            };
            logAvailability({
              group_id: groupId,
              check_in: checkIn,
              check_out: checkOut,
              ...result,
            });
            return result;
          }
          const result: AvailabilityResult = {
            status: d.available ? "available" : "unavailable",
            unit_id: d.unit_id,
            unit_name: d.unit_name,
            available_count: d.available_count ?? (d.available ? 1 : 0),
            total_count: d.total_count ?? 0,
            source: "edge_function",
            fallback_attempted: false,
            fallback_succeeded: false,
          };
          logAvailability({
            group_id: groupId,
            check_in: checkIn,
            check_out: checkOut,
            ...result,
          });
          return result;
        }
        if (error) edgeError = error;
        else edgeMalformed = true;
      } catch (err) {
        edgeError = err;
      }

      // -------- Attempt 2: RPC fallback --------
      try {
        const { data: rpcRows, error: rpcError } = await (supabase as any).rpc(
          "assign_unit_for_group",
          { _group_id: groupId, _check_in: checkIn, _check_out: checkOut },
        );
        if (rpcError) {
          const status = classifyRpcError(rpcError);
          const result: AvailabilityResult = {
            status,
            available_count: 0,
            total_count: 0,
            source: "rpc_fallback",
            fallback_attempted: true,
            fallback_succeeded: false,
            debug: `edge=${edgeError ? String((edgeError as any).message ?? edgeError) : edgeMalformed ? "malformed" : "n/a"} | rpc=${String(rpcError.message ?? rpcError)}`,
          };
          logAvailability({
            group_id: groupId,
            check_in: checkIn,
            check_out: checkOut,
            ...result,
          });
          return result;
        }

        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        const total = row?.total_count ?? 0;
        const avail = row?.available_count ?? 0;
        const picked = row?.unit_id ?? null;

        // Zero-active-unit group again — surface as config, not "sold out".
        if (total === 0) {
          const result: AvailabilityResult = {
            status: "configuration_error",
            available_count: 0,
            total_count: 0,
            source: "rpc_fallback",
            fallback_attempted: true,
            fallback_succeeded: true,
            debug: "rpc returned total_count=0",
          };
          logAvailability({
            group_id: groupId,
            check_in: checkIn,
            check_out: checkOut,
            ...result,
          });
          return result;
        }

        const result: AvailabilityResult = {
          status: picked ? "available" : "unavailable",
          unit_id: picked ?? undefined,
          unit_name: row?.unit_name,
          available_count: avail,
          total_count: total,
          source: "rpc_fallback",
          fallback_attempted: true,
          fallback_succeeded: true,
        };
        logAvailability({
          group_id: groupId,
          check_in: checkIn,
          check_out: checkOut,
          ...result,
        });
        return result;
      } catch (err) {
        // Both attempts failed.
        const status: AvailabilityStatus = edgeMalformed
          ? "unknown_error"
          : classifyInvokeError(err);
        const result: AvailabilityResult = {
          status,
          available_count: 0,
          total_count: 0,
          source: "rpc_fallback",
          fallback_attempted: true,
          fallback_succeeded: false,
          debug: `edge=${edgeError ? String((edgeError as any).message ?? edgeError) : edgeMalformed ? "malformed" : "n/a"} | rpc-throw=${String((err as any)?.message ?? err)}`,
        };
        logAvailability({
          group_id: groupId,
          check_in: checkIn,
          check_out: checkOut,
          ...result,
        });
        return result;
      }
    },
  });
}

export function useUnitGroups() {
  return useQuery({
    queryKey: ["unit-groups-with-info"],
    queryFn: async () => {
      const { data: groups, error: gErr } = await supabase
        .from("unit_groups")
        .select("id, name, description, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (gErr) throw gErr;

      const { data: units, error: uErr } = await supabase
        .from("units")
        .select(
          "id, group_id, base_price, capacity, min_nights, amenities, photos, cleaning_fee, weekend_price",
        )
        .eq("is_active", true)
        .order("sort_order");
      if (uErr) throw uErr;

      return (groups ?? []).map((g) => {
        const groupUnits = (units ?? []).filter((u) => u.group_id === g.id);
        const rep = groupUnits[0];
        return {
          ...g,
          unitIds: groupUnits.map((u) => u.id),
          unitCount: groupUnits.length,
          base_price: rep?.base_price ?? 0,
          capacity: rep?.capacity ?? 2,
          min_nights: rep?.min_nights ?? 1,
          amenities: rep?.amenities ?? [],
          photos: rep?.photos ?? [],
          cleaning_fee: rep?.cleaning_fee ?? 0,
          weekend_price: rep?.weekend_price ?? null,
          representativeUnitId: rep?.id,
        };
      });
    },
  });
}
