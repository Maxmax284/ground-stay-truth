/**
 * MfaAdminResetCard — admin-only recovery path when a staff member loses their
 * authenticator and has no recovery codes left.
 *
 * The reset itself happens server-side (mfa-manage → admin_reset), which
 * requires an admin caller that has already passed its own MFA check, plus a
 * written reason. Everything is audit logged with actor + target.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";

const NONE = "__none__";

export function MfaAdminResetCard() {
  const { isAdmin } = useAuth();
  const { roles } = useUserRoles();
  const [target, setTarget] = useState<string>(NONE);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!isAdmin) return null;

  const staff = (roles.data ?? []).filter((r) => r.role !== "guest");
  const selected = staff.find((s) => s.user_id === target) ?? null;

  const submit = async () => {
    if (target === NONE || reason.trim().length < 5) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-manage", {
        body: { action: "admin_reset", userId: target, reason: reason.trim() },
      });
      const message = (data as { error?: string } | null)?.error;
      if (error || message) {
        toast.error(message ?? "Could not reset MFA.");
        return;
      }
      toast.success("MFA reset. They'll be asked to set up an authenticator app at next sign-in.");
      setTarget(NONE);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          Reset someone's MFA
        </CardTitle>
        <CardDescription>
          Use this only when a staff member has lost access to their authenticator app and their
          recovery codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-sm">Staff member</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Select a staff member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Select a staff member</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.user_id}>
                  {s.profile_name || s.profile_email || s.user_id.slice(0, 8)} — {s.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Reason (recorded in the audit log)</Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lost phone, verified identity by video call"
          />
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={busy || target === NONE || reason.trim().length < 5}
          onClick={() => setConfirmOpen(true)}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Reset MFA
        </Button>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset MFA for {selected?.profile_name || selected?.profile_email || "this account"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their authenticator app and recovery codes stop working right away. They'll have to set up
              a new authenticator before reaching admin screens again. This is logged with your name and
              reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Reset MFA</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default MfaAdminResetCard;
