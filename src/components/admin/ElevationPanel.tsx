/**
 * ElevationPanel — admin-only break-glass console.
 *
 * Two modes, both time-boxed and both logged:
 *  - Self-elevate: an admin opens a window on their own account.
 *  - Grant to staff: an admin lends admin-level authority to a staff member
 *    for a few minutes without a permanent role change.
 *
 * A reason is mandatory. Maximum window is 15 minutes. Every action taken
 * inside a window is tagged `elevated` in the override audit log.
 */
import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, Clock, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ELEVATION_DEFAULT_MINUTES,
  ELEVATION_MAX_MINUTES,
  useElevationGrants,
} from "@/hooks/useAdminElevation";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { formatCampDateTime } from "@/lib/timezone";

const SELF = "__self__";

export function ElevationPanel() {
  const { user } = useAuth();
  const { grants, grant, isGranting, revoke, isRevoking, isLive, isAdmin } = useElevationGrants();
  const { roles } = useUserRoles();

  const [subject, setSubject] = useState<string>(SELF);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<number>(ELEVATION_DEFAULT_MINUTES);

  // Staff who can receive an elevation — anyone with a non-guest role.
  const staffOptions = useMemo(() => {
    const rows = roles.data ?? [];
    const seen = new Map<string, { id: string; label: string; role: string }>();
    for (const r of rows) {
      if (r.role === "guest") continue;
      if (r.user_id === user?.id) continue;
      if (seen.has(r.user_id)) continue;
      seen.set(r.user_id, {
        id: r.user_id,
        label: r.profile_name || r.profile_email || r.user_id.slice(0, 8),
        role: r.role,
      });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [roles.data, user?.id]);

  const nameFor = (userId: string) => {
    const row = (roles.data ?? []).find((r) => r.user_id === userId);
    if (userId === user?.id) return "You";
    return row?.profile_name || row?.profile_email || userId.slice(0, 8);
  };

  if (!isAdmin) return null;

  const handleGrant = async () => {
    if (reason.trim().length < 5) {
      toast.error("Give a reason — at least a few words. It goes in the audit log.");
      return;
    }
    try {
      await grant({
        subjectUserId: subject === SELF ? null : subject,
        reason: reason.trim(),
        minutes,
      });
      toast.success(
        subject === SELF
          ? `Elevation open for ${minutes} min`
          : `${nameFor(subject)} elevated for ${minutes} min`,
      );
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open elevation window");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            Break-glass elevation
          </CardTitle>
          <CardDescription>
            Temporary admin authority, hard-capped at {ELEVATION_MAX_MINUTES} minutes. Everything
            done inside the window is tagged in the override audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="elevation-subject">Who</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="elevation-subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELF}>Me (self-elevate)</SelectItem>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label} · {s.role.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="elevation-minutes">
                Window — {minutes} min
              </Label>
              <Slider
                id="elevation-minutes"
                min={5}
                max={ELEVATION_MAX_MINUTES}
                step={5}
                value={[minutes]}
                onValueChange={(v) => setMinutes(v[0])}
                aria-label={`Elevation window in minutes: ${minutes}`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="elevation-reason">Reason (required, logged)</Label>
            <Input
              id="elevation-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Refund the duplicate charge on booking #1042"
              maxLength={200}
            />
          </div>

          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={isGranting}
            onClick={handleGrant}
          >
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Open elevation window
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Recent elevations
          </CardTitle>
          <CardDescription>Last 30 windows, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {grants.length === 0 && (
            <p className="text-sm text-muted-foreground">No elevation windows yet.</p>
          )}
          {grants.map((g) => {
            const live = isLive(g);
            return (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <Badge variant={live ? "destructive" : "secondary"}>
                  {live ? "Active" : g.revoked_at ? "Closed early" : "Expired"}
                </Badge>
                <span className="font-medium">{nameFor(g.subject_user_id)}</span>
                {g.self_issued ? (
                  <span className="text-xs text-muted-foreground">self-issued</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    by {nameFor(g.granted_by_user_id)}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {g.minutes} min · {formatCampDateTime(g.created_at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {g.reason}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.used_count} logged action{g.used_count === 1 ? "" : "s"}
                </span>
                {live && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isRevoking}
                    onClick={() => revoke(g.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
