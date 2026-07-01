/**
 * Security Center status cards.
 * Pulls MFA policy, staff MFA coverage, recent refunds, payment-link events,
 * webhook health, and SITE_URL status.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, KeyRound, Webhook, RefreshCw, Globe } from "lucide-react";
import { useMfaPolicy } from "@/hooks/useMfa";
import { formatDistanceToNow } from "date-fns";

function useStaffWithoutMfa() {
  return useQuery({
    queryKey: ["security-staff-without-mfa"],
    queryFn: async () => {
      // Count staff (non-guest) accounts; subtract those with verified MFA factors
      // is not directly queryable from client without admin API — surface
      // a soft estimate from staff_audit_events 'mfa_enabled' coverage instead.
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .neq("role", "guest");

      const { data: enrolled } = await supabase
        .from("staff_audit_events")
        .select("actor_id")
        .eq("event_type", "mfa_enabled");

      const enrolledSet = new Set((enrolled ?? []).map((e: any) => e.actor_id));
      const total = roles?.length ?? 0;
      const withMfa = (roles ?? []).filter((r: any) => enrolledSet.has(r.user_id)).length;
      return { total, withoutMfa: total - withMfa };
    },
    refetchInterval: 60_000,
  });
}

function useWebhookHealthSummary() {
  return useQuery({
    queryKey: ["security-webhook-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_health" as any)
        .select("*")
        .order("last_received_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

function useRecentRefunds() {
  return useQuery({
    queryKey: ["security-recent-refunds"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, refund_amount, refunded_at, status")
        .gt("refund_amount", 0)
        .order("refunded_at", { ascending: false, nullsFirst: false })
        .limit(5);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function SecurityCenterOverview() {
  const policy = useMfaPolicy();
  const { data: mfaCoverage } = useStaffWithoutMfa();
  const { data: webhookRows } = useWebhookHealthSummary();
  const { data: refunds } = useRecentRefunds();

  const allMfaCovered = (mfaCoverage?.withoutMfa ?? 0) === 0;
  const isUnsignedProbeReason = (r?: string | null) => !!r && /missing stripe-signature/i.test(r);
  const effectiveStatus = (w: any): "healthy" | "failing" | "awaiting" => {
    if ((w.status === "healthy" || w.status === "ok") && w.last_success_at) return "healthy";
    if (w.status === "failing" && !isUnsignedProbeReason(w.last_failure_reason)) return "failing";
    return "awaiting";
  };
  const webhookHealthy = (webhookRows ?? []).every((w: any) => effectiveStatus(w) !== "failing");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            MFA enforcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Row label="Admins/Owners" on={policy.requiredForAdmin} />
          <Row label="Managers" on={policy.requiredForManager} />
          <Row label="All staff" on={policy.requiredForStaff} />
          <Row label="Sensitive actions" on={policy.requireForSensitiveActions} />
          <p className="text-xs text-muted-foreground pt-1">
            Grace period: {policy.gracePeriodDays} days
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {allMfaCovered ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-orange-500" />
            )}
            Staff MFA coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">
            {mfaCoverage ? mfaCoverage.total - mfaCoverage.withoutMfa : "—"}
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              / {mfaCoverage?.total ?? "—"} enrolled
            </span>
          </div>
          {mfaCoverage && mfaCoverage.withoutMfa > 0 && (
            <Badge variant="outline" className="mt-2 text-xs border-orange-500/40 text-orange-600 dark:text-orange-400">
              {mfaCoverage.withoutMfa} without MFA
            </Badge>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Counts staff with a recorded `mfa_enabled` event.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Webhook className={`h-4 w-4 ${webhookHealthy ? "text-primary" : "text-destructive"}`} />
            Webhook health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {!webhookRows?.length ? (
            <p className="text-muted-foreground text-xs">No events recorded yet.</p>
          ) : (
            webhookRows.map((w: any) => (
              <div key={w.provider ?? w.id} className="flex items-center justify-between text-xs">
                <span className="capitalize">{w.provider}</span>
                <Badge
                  variant="outline"
                  className={
                    w.status === "healthy" || !w.last_failure_at
                      ? "border-primary/40 text-primary"
                      : "border-destructive/40 text-destructive"
                  }
                >
                  {w.status ?? "unknown"}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Recent refunds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {!refunds?.length ? (
            <p className="text-muted-foreground text-xs">No refunds recorded.</p>
          ) : (
            refunds.slice(0, 4).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {r.refunded_at
                    ? formatDistanceToNow(new Date(r.refunded_at), { addSuffix: true })
                    : "—"}
                </span>
                <span className="font-medium">฿{Number(r.refund_amount ?? 0).toFixed(0)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            SITE_URL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Origin used for Stripe redirect + CORS allowlist.
          </p>
          <code className="text-xs bg-muted px-2 py-1 rounded mt-2 inline-block break-all">
            {typeof window !== "undefined" ? window.location.origin : "—"}
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Server-side <code>SITE_URL</code> secret enforces production origins.
            Set it in Cloud secrets for hosted environments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Badge
        variant="outline"
        className={on ? "border-primary/40 text-primary" : "border-muted text-muted-foreground"}
      >
        {on ? "Required" : "Off"}
      </Badge>
    </div>
  );
}
