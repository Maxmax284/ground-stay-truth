/**
 * OpsPasscodePanel — admin control for the Ops security code.
 *
 * Admins set, rotate or remove the code here. The code is never shown back:
 * only a hash lives in the database, so "reveal" is impossible by design.
 * Rotating or removing it closes every open unlock window immediately.
 *
 * Also shows the recent attempt log so a fishing expedition is visible.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Lock, LockOpen, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCountdown, useOpsUnlock } from "@/hooks/useOpsUnlock";
import { clearOpsPasscode, setOpsPasscode, OPS_PASSCODE_MIN_LENGTH } from "@/lib/opsUnlock";
import { formatCampDateTime } from "@/lib/timezone";

interface AttemptRow {
  id: string;
  user_id: string | null;
  succeeded: boolean;
  reason: string | null;
  created_at: string;
}

export function OpsPasscodePanel() {
  const { configured, unlocked, msLeft, updatedAt, refresh, lock } = useOpsUnlock();
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const attempts = useQuery({
    queryKey: ["ops-unlock-attempts"],
    queryFn: async (): Promise<AttemptRow[]> => {
      const { data, error } = await supabase
        .from("ops_unlock_attempts")
        .select("id, user_id, succeeded, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const save = async () => {
    if (newCode.trim().length < OPS_PASSCODE_MIN_LENGTH) {
      toast.error(`Use at least ${OPS_PASSCODE_MIN_LENGTH} characters`);
      return;
    }
    if (newCode !== confirmCode) {
      toast.error("The two codes do not match");
      return;
    }
    setBusy(true);
    try {
      await setOpsPasscode(newCode.trim(), currentCode.trim());
      toast.success(configured ? "Code rotated — everyone must re-enter it" : "Security code set");
      setCurrentCode("");
      setNewCode("");
      setConfirmCode("");
      refresh();
      attempts.refetch();
    } catch (e) {
      const err = e as Error & { code?: string };
      toast.error(
        err.code === "wrong_current_code" ? "Current code is wrong" : "Could not save the code",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!currentCode.trim()) {
      toast.error("Enter the current code to remove the gate");
      return;
    }
    setRemoving(true);
    try {
      await clearOpsPasscode(currentCode.trim());
      toast.success("Gate removed — Deep ops is open to ops staff again");
      setCurrentCode("");
      refresh();
    } catch (e) {
      const err = e as Error & { code?: string };
      toast.error(
        err.code === "wrong_current_code" ? "Current code is wrong" : "Could not remove the gate",
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Ops security code
          {configured ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Active
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> Not set
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Gates Deep ops chat, AI draft approvals and break-glass elevation — for everyone, admins
          included. Unlock lasts 15 minutes of activity and ends when the tab closes. Five wrong
          tries locks that account out for 15 minutes and alerts admins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!configured && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              No code is set, so the gate is open and any ops staff member can use Deep ops. Set one
              below to close it.
            </AlertDescription>
          </Alert>
        )}

        {configured && (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              {unlocked ? (
                <LockOpen className="h-4 w-4 text-emerald-600" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-foreground">
                {unlocked ? `Unlocked in this tab — ${formatCountdown(msLeft)} left` : "Locked"}
              </span>
            </div>
            {unlocked && (
              <Button size="sm" variant="outline" onClick={() => void lock()}>
                Lock now
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {configured && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ops-current">Current code</Label>
              <Input
                id="ops-current"
                type="password"
                autoComplete="off"
                value={currentCode}
                onChange={(e) => setCurrentCode(e.target.value)}
                placeholder="Required to rotate or remove"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="ops-new">{configured ? "New code" : "Security code"}</Label>
            <Input
              id="ops-new"
              type="password"
              autoComplete="new-password"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder={`At least ${OPS_PASSCODE_MIN_LENGTH} characters`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ops-confirm">Confirm</Label>
            <Input
              id="ops-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder="Type it again"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : configured ? "Rotate code" : "Set code"}
          </Button>
          {configured && (
            <Button variant="outline" onClick={remove} disabled={removing}>
              {removing ? "Removing…" : "Remove gate"}
            </Button>
          )}
        </div>

        {updatedAt && (
          <p className="text-xs text-muted-foreground">
            Last changed {formatCampDateTime(updatedAt)}. The code itself is stored hashed and can
            never be read back — if it is lost, rotate it.
          </p>
        )}

        {(attempts.data?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Recent code entries</p>
            <div className="space-y-1">
              {attempts.data!.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs"
                >
                  <span className={a.succeeded ? "text-muted-foreground" : "text-destructive"}>
                    {a.succeeded ? "Unlocked" : "Wrong code"}
                    {a.reason === "rotate_wrong_current" ? " (rotation attempt)" : ""}
                  </span>
                  <span className="text-muted-foreground">{formatCampDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OpsPasscodePanel;
