// src/components/monitoring/AdminEmailHealth.tsx
// -----------------------------------------------------------------------------
// Operations Monitor panel: the health of the ADMIN alert email lane.
// Deliberately separate from guest email health — guest confirmations are
// tracked elsewhere. This panel answers: are Nikki and the admins actually
// getting their alerts?
// -----------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import { EVENTS_BY_KEY } from "@/lib/adminAlertCatalog";

interface LogRow {
  id: string;
  event_type: string;
  category: string | null;
  severity: string | null;
  recipient_email: string | null;
  status: string;
  failure_reason: string | null;
  is_test: boolean;
  created_at: string;
}

export function AdminEmailHealth() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_alert_log")
        .select("id, event_type, category, severity, recipient_email, status, failure_reason, is_test, created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      setRows((data ?? []) as LogRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Admin Email Health</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const sent = rows.filter((r) => r.status === "sent");
  const failed = rows.filter((r) => r.status === "failed");
  const suppressed = rows.filter((r) => r.status === "suppressed");
  const lastTest = rows.find((r) => r.is_test);

  const verdict = failed.length === 0
    ? sent.length > 0
      ? "Admin alert emails are going out fine."
      : "No admin alert emails sent yet — send a test from Settings → Notifications."
    : `${failed.length} admin alert email${failed.length === 1 ? "" : "s"} failed to deliver.`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" /> Admin Email Health
          <Badge variant={failed.length ? "destructive" : "secondary"} className="ml-auto text-xs">
            {failed.length ? "Needs attention" : "Healthy"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm flex items-start gap-2">
          {failed.length ? (
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          )}
          {verdict}
        </p>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Sent", sent.length],
            ["Failed", failed.length],
            ["Grouped", suppressed.length],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-md bg-muted/50 p-2">
              <div className="text-lg font-semibold">{n as number}</div>
              <div className="text-[11px] text-muted-foreground">{label as string}</div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          Last test to admins:{" "}
          {lastTest
            ? `${new Date(lastTest.created_at).toLocaleString()} — ${lastTest.status} (${lastTest.recipient_email})`
            : "none yet"}
        </div>

        {failed.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium">Failed recipients</div>
            {failed.slice(0, 6).map((f) => (
              <div key={f.id} className="text-xs text-destructive">
                {EVENTS_BY_KEY[f.event_type]?.label ?? f.event_type} → {f.recipient_email}
                {f.failure_reason ? ` — ${f.failure_reason}` : ""}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <div className="text-xs font-medium">Recent admin alerts</div>
          {rows.slice(0, 8).map((r) => (
            <div key={r.id} className="text-xs flex items-center justify-between gap-2">
              <span>{EVENTS_BY_KEY[r.event_type]?.label ?? r.event_type}{r.is_test ? " (test)" : ""}</span>
              <span className="text-muted-foreground">
                {r.status} · {new Date(r.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="text-xs text-muted-foreground">No activity yet.</div>}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Guest confirmation email health is tracked separately — this panel is only alerts sent to staff.
        </p>
      </CardContent>
    </Card>
  );
}
