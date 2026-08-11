/**
 * TrustedDevicesCard — admin-only device list and management.
 *
 * Plain English on purpose: this is a security surface, not a dashboard.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Laptop,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  ShieldCheck,
  ShieldOff,
  Ban,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useDeviceActions,
  useDevicePolicy,
  useTrustedDevices,
  useCurrentDeviceKey,
  type TrustedDeviceWithOwner,
} from "@/hooks/useTrustedDevices";
import { deviceDisplayStatus } from "@/lib/deviceRecognition";
import { formatCampDateTime, CAMP_TIMEZONE_LABEL } from "@/lib/timezone";
import { toast } from "sonner";

const TYPE_ICON: Record<string, typeof Laptop> = {
  laptop: Laptop,
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
  browser: Globe,
  unknown: Globe,
};

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  trusted: { label: "Trusted", className: "border-primary/40 text-primary" },
  pending: { label: "Waiting for approval", className: "border-amber-500/40 text-amber-500" },
  revoked: { label: "Trust removed", className: "border-muted-foreground/40 text-muted-foreground" },
  blocked: { label: "Blocked", className: "border-destructive/50 text-destructive" },
  expired: { label: "Trust expired", className: "border-muted-foreground/40 text-muted-foreground" },
};

function DeviceRow({
  device,
  isCurrent,
  onAction,
  busy,
}: {
  device: TrustedDeviceWithOwner;
  isCurrent: boolean;
  onAction: ReturnType<typeof useDeviceActions>["mutate"];
  busy: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(device.label);
  const status = deviceDisplayStatus(device);
  const Icon = TYPE_ICON[device.device_type] ?? Globe;
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.pending;

  const confirmRevoke = () => {
    if (isCurrent) {
      const ok = window.confirm(
        "Remove trust from the device you're using right now? If device recognition is on, you may need to verify and approve this device again before you can reach admin controls."
      );
      if (!ok) return;
    }
    onAction({ kind: "revoke", device });
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            {renaming ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={name}
                  autoFocus
                  className="h-7 w-48 text-sm"
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    onAction({ kind: "rename", device, label: name.trim() || device.label });
                    setRenaming(false);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRenaming(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <p className="truncate text-sm font-medium">
                {device.label}
                {isCurrent && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    This device
                  </Badge>
                )}
                {device.is_sandbox && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Sandbox
                  </Badge>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {[device.browser, device.os, device.device_type].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {device.owner_name || device.owner_email || "Unknown account"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`text-xs ${style.className}`}>
          {style.label}
        </Badge>
      </div>

      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>Last used: {formatCampDateTime(device.last_seen_at)}</span>
        <span>First seen: {formatCampDateTime(device.first_seen_at)}</span>
        {device.approved_at && <span>Approved: {formatCampDateTime(device.approved_at)}</span>}
        {device.expires_at && <span>Trust expires: {formatCampDateTime(device.expires_at)}</span>}
        {device.last_mfa_verified_at && (
          <span>Last MFA check: {formatCampDateTime(device.last_mfa_verified_at)}</span>
        )}
        {device.ip_address && <span>IP: {device.ip_address}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {status !== "trusted" && device.status !== "blocked" && (
          <Button size="sm" disabled={busy} onClick={() => onAction({ kind: "approve", device, selfApproved: isCurrent })}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
            Approve device
          </Button>
        )}
        {(status === "trusted" || status === "expired") && (
          <Button size="sm" variant="outline" disabled={busy} onClick={confirmRevoke}>
            <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
            Revoke trust
          </Button>
        )}
        {device.status !== "blocked" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: "block", device })}>
            <Ban className="mr-1.5 h-3.5 w-3.5" />
            Block device
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: "unblock", device })}>
            Unblock
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRenaming(true)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Rename
        </Button>
        {!isCurrent && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Remove "${device.label}" from the device list?`)) {
                onAction({ kind: "remove", device });
              }
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function TrustedDevicesCard() {
  const { isAdmin, user } = useAuth();
  const deviceKey = useCurrentDeviceKey();
  const devices = useTrustedDevices();
  const actions = useDeviceActions();
  const { policy } = useDevicePolicy();

  const rows = useMemo(() => devices.data ?? [], [devices.data]);

  if (!isAdmin) return null;

  const run: ReturnType<typeof useDeviceActions>["mutate"] = (vars, opts) =>
    actions.mutate(vars, {
      ...opts,
      onError: (e) => toast.error((e as Error)?.message ?? "Could not update this device."),
      onSuccess: () => toast.success("Device updated."),
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Laptop className="h-4 w-4 text-primary" />
          Trusted devices
        </CardTitle>
        <CardDescription>
          Trusted devices are laptops, phones, tablets, or browsers approved for admin access. This does
          not replace MFA — admins may still need an authenticator code. Times shown in{" "}
          {CAMP_TIMEZONE_LABEL}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!policy.enabled && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Device recognition is off. Devices below are recorded for visibility only — nothing is being
            blocked.
          </div>
        )}

        {devices.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No admin devices recorded yet. Your current device appears here the next time an admin page
            loads.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                isCurrent={d.device_key === deviceKey && d.user_id === user?.id}
                onAction={run}
                busy={actions.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TrustedDevicesCard;
