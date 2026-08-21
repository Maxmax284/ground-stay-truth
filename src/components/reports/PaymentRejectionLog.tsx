/**
 * Rejected payment attempts — manager review surface.
 *
 * Every refusal of a hand-recorded payment lands here with the attempted
 * amount next to the balance the ledger actually computed, so a manager can
 * tell "staffer fat-fingered the amount" apart from "staffer isn't allowed to
 * touch this property".
 */
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RejectionRow {
  id: string;
  created_at: string;
  booking_id: string | null;
  actor_role: string | null;
  attempted_amount: number;
  computed_outstanding: number | null;
  tolerance: number;
  reason_code: string;
  method: string | null;
  source_channel: string | null;
  origin: string;
}

const REASON_LABELS: Record<string, string> = {
  AMOUNT_EXCEEDS_OUTSTANDING: "Amount over balance",
  BOOKING_ALREADY_SETTLED: "Already paid in full",
  NOT_AUTHORIZED_TO_RECORD_PAYMENT: "Role not permitted",
  BOOKING_OUTSIDE_PROPERTY_SCOPE: "Wrong property scope",
  RLS_DENIED: "Permission denied",
};

export default function PaymentRejectionLog() {
  const { data: policies } = usePolicySettings();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["payment-rejection-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_rejection_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RejectionRow[];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldX className="h-4 w-4 text-destructive" />
          Rejected payment attempts
          <Badge variant="outline" className="ml-auto text-xs">
            {rows?.length ?? 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rejected attempts…</p>
        ) : !rows?.length ? (
          <p className="text-sm text-muted-foreground">
            No payment attempts have been rejected. Nothing to review.
          </p>
        ) : (
          <ScrollArea className="h-[360px] pr-2">
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-card/50 p-3 space-y-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {REASON_LABELS[row.reason_code] ?? row.reason_code.replace(/_/g, " ")}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {row.origin === "client_guard" ? "blocked in app" : "blocked by ledger"}
                    </Badge>
                    {row.actor_role && (
                      <Badge variant="outline" className="text-[10px]">{row.actor_role}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Attempted {formatPrice(Number(row.attempted_amount), policies)}
                    {row.computed_outstanding != null && (
                      <> · outstanding {formatPrice(Number(row.computed_outstanding), policies)}</>
                    )}
                    {" · tolerance "}
                    {formatPrice(Number(row.tolerance), policies)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.method ?? "unknown method"}
                    {row.source_channel ? ` · ${row.source_channel}` : ""}
                    {" · "}
                    {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    {row.booking_id ? ` · booking ${row.booking_id.slice(0, 8)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
