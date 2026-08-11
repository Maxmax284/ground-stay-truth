/**
 * DeviceRecognitionCard — the Off/On switch and its settings.
 *
 * LOCKOUT GUARD: enforcement cannot be switched on until at least one
 * admin-level device is trusted (and not expired).
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Fingerprint, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useCurrentDeviceKey,
  useDeviceActions,
  useDevicePolicy,
  useSaveDevicePolicy,
  useTrustedDevices,
} from "@/hooks/useTrustedDevices";
import { canEnableDeviceRecognition, DEVICE_TRUST_DAY_OPTIONS } from "@/lib/deviceRecognition";
import { toast } from "sonner";

const TRUST_LABEL: Record<number, string> = {
  0: "Never expires",
  7: "7 days",
  30: "30 days",
  90: "90 days",
};

export function DeviceRecognitionCard() {
  const { isAdmin, user } = useAuth();
  const { policy } = useDevicePolicy();
  const save = useSaveDevicePolicy();
  const devices = useTrustedDevices();
  const actions = useDeviceActions();
  const deviceKey = useCurrentDeviceKey();

  const [local, setLocal] = useState(policy);
  useEffect(() => setLocal(policy), [policy]);

  if (!isAdmin) return null;

  const rows = devices.data ?? [];
  const currentDevice = rows.find((d) => d.device_key === deviceKey && d.user_id === user?.id) ?? null;
  const hasTrusted = canEnableDeviceRecognition(rows);

  const toggleEnabled = (next: boolean) => {
    if (next && !hasTrusted) {
      toast.error("Trust this device first before enabling device recognition.");
      return;
    }
    if (next) {
      const ok = window.confirm(
        "Before turning this on, make sure your current device is trusted. Otherwise admin access may be restricted. Continue?"
      );
      if (!ok) return;
    }
    setLocal((p) => ({ ...p, enabled: next }));
  };

  const trustCurrent = () => {
    if (!currentDevice) {
      toast.error("This device isn't recorded yet. Refresh the page and try again.");
      return;
    }
    actions.mutate(
      { kind: "approve", device: currentDevice, selfApproved: true },
      {
        onSuccess: () => toast.success("This device is now trusted."),
        onError: (e) => toast.error((e as Error)?.message ?? "Could not trust this device."),
      }
    );
  };

  const persist = () => {
    save.mutate(local, {
      onSuccess: () => toast.success("Device recognition settings saved."),
      onError: (e) => toast.error((e as Error)?.message ?? "Could not save settings."),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="h-4 w-4 text-primary" />
          Device recognition
          <Badge variant="outline" className={local.enabled ? "border-primary/40 text-primary" : ""}>
            {policy.enabled ? "On" : "Off"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Device recognition is off by default. Turn it on when you are ready to require admin device
          approval. MFA confirms the person — this confirms the device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">Current device</p>
          <p className="text-muted-foreground">
            {currentDevice ? currentDevice.label : "Not recorded yet"}
            {currentDevice ? ` — ${currentDevice.status === "trusted" ? "trusted" : currentDevice.status}` : ""}
          </p>
          {currentDevice?.status !== "trusted" && (
            <Button size="sm" onClick={trustCurrent} disabled={actions.isPending || !currentDevice}>
              {actions.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
              Trust this device
            </Button>
          )}
        </div>

        {!hasTrusted && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-500" />
            <p>
              Do not turn this on until at least one admin device is trusted. Trust this device first
              before enabling device recognition.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Device recognition (enforce approval)</Label>
            <Switch checked={local.enabled} onCheckedChange={toggleEnabled} disabled={!hasTrusted && !local.enabled} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Require device approval for admin access</Label>
            <Switch
              checked={local.requireApproval}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, requireApproval: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Require MFA on a new device</Label>
            <Switch
              checked={local.requireMfaOnNewDevice}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, requireMfaOnNewDevice: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Allow admins to approve their own device after MFA</Label>
            <Switch
              checked={local.allowSelfApproval}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, allowSelfApproval: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Trusted device expires after</Label>
            <Select
              value={String(local.trustDays)}
              onValueChange={(v) => setLocal((p) => ({ ...p, trustDays: Number(v) }))}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TRUST_DAY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {TRUST_LABEL[d] ?? `${d} days`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Revoke trusted devices after a password change</Label>
            <Switch
              checked={local.revokeOnPasswordChange}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, revokeOnPasswordChange: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Revoke trusted devices after an MFA reset</Label>
            <Switch
              checked={local.revokeOnMfaReset}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, revokeOnMfaReset: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm">Revoke trusted devices after a role change</Label>
            <Switch
              checked={local.revokeOnRoleChange}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, revokeOnRoleChange: v }))}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          New admin devices will need approval before they can access bookings, payments, guest documents,
          settings, and Ops. Trusted device expiration is separate from how often MFA asks for a code.
        </p>

        <Button onClick={persist} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save device settings
        </Button>
      </CardContent>
    </Card>
  );
}

export default DeviceRecognitionCard;
