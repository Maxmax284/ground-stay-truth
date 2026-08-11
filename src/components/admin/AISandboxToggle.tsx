/**
 * AISandboxToggle — explicit practice-mode switch for Settings → Ops.
 *
 * Flipping this switches the active property to the sandbox camp, so the whole
 * deep-ops loop (agent reads -> drafts -> approve) runs against fake inventory.
 * Sandbox bookings never email a guest, never create a Stripe charge, never
 * fire an admin alert and never touch live rooms.
 *
 * Flipping it back returns to the live camp that was active before.
 */
import { useEffect, useState } from "react";
import { FlaskConical, RotateCcw, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useProperty } from "@/hooks/useProperty";
import { useSandbox } from "@/hooks/useSandbox";

const LAST_LIVE_KEY = "ai-ops.last-live-property";

export function AISandboxToggle() {
  const { activeProperty, properties, switchProperty } = useProperty();
  const { status, reset } = useSandbox();
  const [busy, setBusy] = useState(false);

  const inSandbox = Boolean(activeProperty?.is_sandbox);
  const sandboxProperty = properties.find((p) => p.is_sandbox) ?? null;
  const liveProperties = properties.filter((p) => !p.is_sandbox);

  // Remember the live camp so the toggle can put you back exactly where you were.
  useEffect(() => {
    if (activeProperty && !activeProperty.is_sandbox) {
      try {
        localStorage.setItem(LAST_LIVE_KEY, activeProperty.id);
      } catch {}
    }
  }, [activeProperty]);

  const handleToggle = (next: boolean) => {
    if (next) {
      if (!sandboxProperty) {
        toast.error("No sandbox camp is assigned to your account yet — reset the sandbox first.");
        return;
      }
      switchProperty(sandboxProperty.id);
      toast.success("Practice mode on — you are in the sandbox camp");
      return;
    }
    let target: string | null = null;
    try {
      target = localStorage.getItem(LAST_LIVE_KEY);
    } catch {}
    const back = liveProperties.find((p) => p.id === target) ?? liveProperties[0] ?? null;
    if (!back) {
      toast.error("No live camp is assigned to your account.");
      return;
    }
    switchProperty(back.id);
    toast.success(`Back on the live camp — ${back.name}`);
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await reset.mutateAsync();
      toast.success("Sandbox reset — fresh practice data seeded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset the sandbox");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={inSandbox ? "border-destructive/50" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-primary" />
              Practice mode (sandbox)
            </CardTitle>
            <CardDescription>
              Run the whole Ops loop against fake data before touching the live camp.
            </CardDescription>
          </div>
          {inSandbox ? (
            <Badge variant="destructive">Sandbox active</Badge>
          ) : (
            <Badge variant="outline">Live camp active</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div className="min-w-0">
            <Label htmlFor="ai-ops-sandbox" className="text-sm font-medium">
              Test the loop in the sandbox
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {inSandbox
                ? `You are on ${activeProperty?.name ?? "the sandbox camp"} — nothing here reaches a guest.`
                : `Currently on ${activeProperty?.name ?? "your live camp"} — real guests, real money.`}
            </p>
          </div>
          <Switch
            id="ai-ops-sandbox"
            checked={inSandbox}
            onCheckedChange={handleToggle}
            aria-label="Switch between the sandbox camp and the live camp"
          />
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            While practice mode is on
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>No guest or staff email is sent for anything you do.</li>
            <li>No Stripe payment link or charge is created — requests are simulated.</li>
            <li>No admin alert or push notification fires.</li>
            <li>Live rooms, bookings and money stay untouched.</li>
            <li>Approved AI drafts and overrides still write audit rows, tagged to the sandbox.</li>
          </ul>
        </div>

        {!sandboxProperty && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
            {status.data?.propertyId
              ? "A sandbox camp exists but isn't assigned to your account — ask an admin to add the assignment."
              : "No sandbox camp yet. Reset to create one, then flip the switch."}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={busy || reset.isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {busy || reset.isPending ? "Resetting…" : "Reset sandbox data"}
          </Button>
          {status.data?.propertyId && (
            <span className="text-xs text-muted-foreground">
              {status.data.units} fake rooms · {status.data.bookings} fake bookings
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default AISandboxToggle;
