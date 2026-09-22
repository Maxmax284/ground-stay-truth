import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ARRIVAL_RETENTION, retentionCutoff } from "@/lib/arrivalRetention";

/**
 * Admin health line for Arrival Intelligence (Stage 5).
 * One glance: is travel data flowing, is anything waiting on a human, and is
 * the automatic clean-up actually removing old uploads.
 */
async function fetchArrivalHealth() {
  const count = (q: any) => q.then((r: any) => r.count ?? 0);

  const checkoutCutoff = retentionCutoff(ARRIVAL_RETENTION.evidenceDaysAfterCheckout)
    .slice(0, 10);

  const [legs, facts, openConflicts, evidence] = await Promise.all([
    count(supabase.from("journey_legs").select("id", { count: "exact", head: true })),
    count(supabase.from("flight_facts").select("id", { count: "exact", head: true })),
    count(
      supabase
        .from("arrival_conflicts")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ),
    count(supabase.from("journey_evidence").select("id", { count: "exact", head: true })),
  ]);

  // Uploads attached to stays that ended past the retention window: should be 0
  // shortly after each nightly purge.
  const { data: expiredBookings } = await supabase
    .from("bookings")
    .select("id")
    .lt("check_out", checkoutCutoff)
    .limit(2000);

  let overdueEvidence = 0;
  const ids = (expiredBookings ?? []).map((b) => b.id);
  if (ids.length) {
    const { count: c } = await supabase
      .from("journey_evidence")
      .select("id", { count: "exact", head: true })
      .in("booking_id", ids);
    overdueEvidence = c ?? 0;
  }

  return { legs, facts, openConflicts, evidence, overdueEvidence };
}

export function ArrivalDataHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["arrival-data-health"],
    queryFn: fetchArrivalHealth,
    refetchInterval: 300_000,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Arrival travel data</CardTitle>
        {data && (
          <Badge variant={data.overdueEvidence > 0 ? "destructive" : "outline"}>
            {data.overdueEvidence > 0 ? "Clean-up overdue" : "Clean-up on track"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <div className="text-sm text-muted-foreground">Checking…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Travel legs on file", value: data.legs },
                { label: "Flights we track", value: data.facts },
                { label: "Waiting on a person", value: data.openConflicts },
                { label: "Guest uploads stored", value: data.evidence },
              ].map((s) => (
                <div key={s.label} className="rounded-md border p-3">
                  <div className="text-xl font-semibold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Guest uploads are deleted {ARRIVAL_RETENTION.evidenceDaysAfterCheckout} days after
              checkout, flight records after {ARRIVAL_RETENTION.flightFactDays} days, and settled
              disagreements after {ARRIVAL_RETENTION.resolvedConflictDays} days. Who entered what,
              and when, is kept for two years.
              {data.overdueEvidence > 0 && (
                <span className="text-destructive">
                  {" "}
                  {data.overdueEvidence} upload(s) are past their delete date — the nightly clean-up
                  has not run.
                </span>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
