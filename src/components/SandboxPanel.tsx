/**
 * SandboxPanel — Settings → Sandbox.
 *
 * Staff practice ground. Admins and managers can wipe and re-seed a fake camp,
 * then break the Modify Stay workflow safely: sandbox bookings cannot send
 * emails, admin alerts or Stripe payment requests.
 */
import { useState } from "react";
import { AlertTriangle, FlaskConical, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useSandbox, SANDBOX_SCENARIOS } from "@/hooks/useSandbox";
import { useProperty } from "@/hooks/useProperty";

export function SandboxPanel() {
  const { status, reset } = useSandbox();
  const { activeProperty } = useProperty();
  const [open, setOpen] = useState(false);

  const handleReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success("Sandbox reset — fresh practice camp seeded");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reset the sandbox");
    }
  };

  const inSandbox = Boolean((activeProperty as any)?.is_sandbox);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-primary" />
                Sandbox camp
              </CardTitle>
              <CardDescription>
                A fake camp for practising real workflows. Nothing here reaches a guest.
              </CardDescription>
            </div>
            {inSandbox ? (
              <Badge variant="destructive">You are in the sandbox</Badge>
            ) : (
              <Badge variant="outline">Live camp active</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : status.data?.propertyId ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border border-border p-3">
                <div className="text-xl font-semibold">{status.data.units}</div>
                <div className="text-xs text-muted-foreground">fake rooms</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xl font-semibold">{status.data.bookings}</div>
                <div className="text-xs text-muted-foreground">fake bookings</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xl font-semibold">5</div>
                <div className="text-xs text-muted-foreground">scenarios</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sandbox yet. Reset to create one.
            </p>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Isolation guarantees
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>No guest or staff email is ever sent for a sandbox booking.</li>
              <li>No admin alert or push notification fires from sandbox activity.</li>
              <li>No Stripe payment link is created — requests are simulated only.</li>
              <li>Live rooms, bookings and money are never touched by a reset.</li>
            </ul>
          </div>

          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={reset.isPending}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {reset.isPending ? "Resetting…" : "Reset sandbox"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the sandbox?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every fake booking, payment and task in the sandbox camp is deleted and
                  re-seeded from scratch. Your live camp is untouched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Practice scenarios</CardTitle>
          <CardDescription>
            Seeded on every reset. Open the booking in the sandbox camp and run Modify Stay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {SANDBOX_SCENARIOS.map((s) => (
            <div key={s.name} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{s.guest}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{s.what}</p>
            </div>
          ))}
          <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Switch to “Sandbox Camp (Practice)” in the property switcher to see this data.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
