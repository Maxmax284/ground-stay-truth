/**
 * Override attribution panel — "who overrode this, and why".
 *
 * Every manual override in CampStay lands in override_audit_log with the actor
 * resolved server-side. This panel is the human-readable view of that trail,
 * plus a loud warning when anything is missing attribution.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, UserCheck, AlertTriangle } from "lucide-react";
import { useRecentOverrides, useOverrideAttributionHealth } from "@/hooks/useOverrideAudit";
import { formatOverrideAttribution, describeOverrideChange } from "@/lib/overrideAudit";

const ACTION_LABELS: Record<string, string> = {
  booking_state_override: "Booking status changed by hand",
  booking_deadline_override: "Hold deadline extended",
  booking_deadline_override_cleared: "Hold deadline reset to policy",
  laundry_status_override: "Laundry status forced",
  maintenance_status_override: "Maintenance status forced",
  housekeeping_status_override: "Housekeeping status changed",
  maintenance_block_removed: "Maintenance block removed",
  guest_document_review_override: "Guest document decision",
  manual_payment_recorded: "Payment recorded by hand",
  pickup_assist_mode_override: "Pickup assist mode changed",
  pickup_tdac_confirmed: "TDAC marked complete",
  pickup_connectivity_assumed: "Connectivity assumed",
};

function label(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function OverrideAuditPanel() {
  const [hours, setHours] = useState("168");
  const { data: overrides = [], isLoading } = useRecentOverrides(Number(hours));
  const { data: health } = useOverrideAttributionHealth();

  const missingNow = useMemo(
    () => overrides.filter((o) => o.attribution_missing).length,
    [overrides],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> Overrides — who did what
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Every manual override, with the name and role of the person who made it.
          </p>
        </div>
        <Tabs value={hours} onValueChange={setHours}>
          <TabsList className="h-8">
            <TabsTrigger value="24" className="text-xs">Today</TabsTrigger>
            <TabsTrigger value="168" className="text-xs">Last 7 days</TabsTrigger>
            <TabsTrigger value="720" className="text-xs">30 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-3">
        {(health?.missing ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                {health!.missing} override{health!.missing === 1 ? "" : "s"} can't be traced to a person
              </p>
              <p className="mt-0.5 text-muted-foreground">
                These happened before attribution logging, or the account behind them couldn't be
                resolved. New overrides always carry a name.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading override history…</p>
        ) : overrides.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No overrides in this window. Nothing was forced by hand.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                <UserCheck className="h-3 w-3" />
                {overrides.length - missingNow} attributed
              </Badge>
              {missingNow > 0 && (
                <Badge variant="destructive">{missingNow} unattributed in this window</Badge>
              )}
            </div>

            <div className="space-y-2">
              {overrides.map((o) => {
                const change = describeOverrideChange(o);
                return (
                  <div
                    key={o.id}
                    className="rounded-md border border-border/60 bg-card/40 p-3 text-xs transition-all duration-300 hover:-translate-y-[2px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{label(o.action_type)}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {o.target_type.replace(/_/g, " ")}
                      </Badge>
                      {o.attribution_missing && (
                        <Badge variant="destructive" className="text-[10px]">attribution missing</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground">{formatOverrideAttribution(o)}</p>
                    {change && <p className="mt-1 text-muted-foreground">{change}</p>}
                    {o.reason && <p className="mt-1 italic text-muted-foreground">“{o.reason}”</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
