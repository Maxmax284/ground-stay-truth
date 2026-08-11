/**
 * DeviceGate — blocks admin surfaces on an unapproved device.
 *
 * Only active when device recognition is ON and the user is admin-level.
 * Renders INSTEAD of its children, so no admin page, query or data fetch
 * behind it ever mounts — direct URL navigation hits the same gate.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceGate, useRegisterCurrentDevice } from "@/hooks/useTrustedDevices";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import { toast } from "sonner";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export function DeviceGate({ children }: { children: React.ReactNode }) {
  useRegisterCurrentDevice();
  const gate = useDeviceGate();
  const { signOut } = useAuth();
  const logAudit = useLogStaffAudit();
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    if (!gate.restricted || logged) return;
    setLogged(true);
    logAudit.mutate({
      eventType: "device_access_denied",
      severity: "high",
      reason: `Admin access held back — device ${gate.state}`,
      metadata: {
        device_id: gate.currentDevice?.id ?? null,
        device_label: gate.currentDevice?.label ?? null,
        result: "failure",
      },
    });
  }, [gate.restricted, gate.state, gate.currentDevice, logged, logAudit]);

  if (gate.state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="roundhouse-spinner" />
      </div>
    );
  }

  if (!gate.restricted) return <>{children}</>;

  const blocked = gate.state === "blocked";
  const approveSelf = async () => {
    setBusy(true);
    try {
      await gate.approveCurrent();
      toast.success("This device is now trusted.");
      gate.refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not approve this device.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="h-5 w-5 text-primary" />
          {blocked ? "This device is blocked" : "New admin device detected"}
        </CardTitle>
        <CardDescription>
          {blocked
            ? "An authorized admin has to unblock this device before it can access admin controls."
            : "Please approve this device before accessing admin controls. Bookings, payments, guest documents, settings, and Ops stay locked until then."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">{gate.currentDevice?.label ?? "This browser"}</p>
          <p className="text-muted-foreground">
            {[gate.currentDevice?.browser, gate.currentDevice?.os].filter(Boolean).join(" · ") ||
              "Details unavailable"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          This does not replace MFA. You already passed your authenticator check — this step confirms the
          device itself.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!blocked && gate.canSelfApprove && (
            <Button className="flex-1" disabled={busy || !gate.currentDevice} onClick={approveSelf}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Trust this device for admin access
            </Button>
          )}
          {!blocked && !gate.canSelfApprove && (
            <div className="flex-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              Another admin has to approve this device from Security Operations → Trusted devices.
            </div>
          )}
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </CardContent>
    </Shell>
  );
}

export default DeviceGate;
