/**
 * PaymentLinkAbuseCard — admin-only.
 * Surfaces recently abuse-locked payment links and links with unusually
 * high resolve attempts. Detection only — no IP rate limiting is performed
 * (platform doesn't yet have rate-limiting primitives).
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  booking_id: string;
  attempt_count: number;
  abuse_locked_at: string | null;
  abuse_reason: string | null;
  last_attempt_at: string | null;
  expires_at: string;
};

const HIGH_ATTEMPT_THRESHOLD = 6;

export function PaymentLinkAbuseCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("payment_links")
        .select("id, booking_id, attempt_count, abuse_locked_at, abuse_reason, last_attempt_at, expires_at")
        .or(`abuse_locked_at.not.is.null,attempt_count.gte.${HIGH_ATTEMPT_THRESHOLD}`)
        .order("last_attempt_at", { ascending: false, nullsFirst: false })
        .limit(20);
      setRows((data as Row[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <CardTitle className="text-sm font-semibold">Payment-link abuse signals</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">No suspicious payment-link activity.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">
                    booking {r.booking_id.slice(0, 8)}…
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.attempt_count} attempts
                    {r.last_attempt_at &&
                      ` · last ${formatDistanceToNow(new Date(r.last_attempt_at), { addSuffix: true })}`}
                    {r.abuse_reason && ` · ${r.abuse_reason}`}
                  </div>
                </div>
                {r.abuse_locked_at ? (
                  <Badge variant="destructive">Locked</Badge>
                ) : (
                  <Badge variant="secondary">High attempts</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Detection only. Links are auto-locked after {12} attempts.
          IP-level rate limiting will be added when platform primitives land.
        </p>
      </CardContent>
    </Card>
  );
}
