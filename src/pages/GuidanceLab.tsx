/**
 * GuidanceLab — isolated test harness for the Staff Guidance primitives.
 *
 * Not linked from the sidebar on purpose. Reach it at /guidance-lab.
 * Lets you preview GuidanceTooltip + PageHelp against any seeded key
 * without touching live UI surfaces.
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GuidanceTooltip } from "@/components/guidance/GuidanceTooltip";
import { PageHelp } from "@/components/guidance/PageHelp";
import { useGuidance } from "@/hooks/useGuidance";

const SEEDED_KEYS = [
  "maintenance_block",
  "add_existing_booking",
  "deposit_link",
  "front_desk",
  "ops_control_tower",
  "stripe_awaiting_first_event",
  "manual_guest_name",
  "training_guest",
  "pickup_pending",
  "turnover",
  "housekeeping",
  "guest_portal_preview",
  "payment_pending",
  "manual_payment",
  "messages",
  "notifications",
  "booking_source",
  "room_available",
  "operations_monitor",
  "lost_guest_assist",
];

export default function GuidanceLab() {
  const [key, setKey] = useState("front_desk");
  const { data, isLoading } = useGuidance(key);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Guidance Lab</h1>
            <p className="text-sm text-muted-foreground">
              Isolated harness for <code>GuidanceTooltip</code> and <code>PageHelp</code>. Not linked from the sidebar.
            </p>
          </div>
          <PageHelp guidanceKey={key} variant="button" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pick a guidance key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input id="key" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="e.g. front_desk" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SEEDED_KEYS.map((k) => (
                <Button
                  key={k}
                  variant={k === key ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setKey(k)}
                >
                  {k}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tooltip preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <GuidanceTooltip guidanceKey={key} fallback="No entry found for this key.">
              <Button variant="outline">Hover me</Button>
            </GuidanceTooltip>
            <GuidanceTooltip guidanceKey={key} side="right">
              <Badge variant="secondary" className="cursor-help">Chip target</Badge>
            </GuidanceTooltip>
            <GuidanceTooltip guidanceKey={key} side="bottom">
              <span className="underline decoration-dotted underline-offset-4 cursor-help text-sm">
                Inline text target
              </span>
            </GuidanceTooltip>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">PageHelp preview</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <PageHelp guidanceKey={key} />
            <PageHelp guidanceKey={key} variant="button" />
            <span className="text-xs text-muted-foreground">
              Icon and button variants open the same sheet.
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolved entry (debug)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !data ? (
              <p className="text-sm text-muted-foreground">
                No approved entry visible for <code>{key}</code> at your role. Check spelling or role gating.
              </p>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">tone: {data.tone}</Badge>
                  <Badge variant="outline">risk: {data.risk_level}</Badge>
                  <Badge variant="outline">status: {data.status}</Badge>
                  {data.guest_visible && <Badge variant="outline">guest_visible</Badge>}
                  {data.internal_only && <Badge variant="outline">internal_only</Badge>}
                </div>
                <pre className="text-[11px] bg-muted p-3 rounded overflow-auto max-h-72">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
