/**
 * Per-user MFA enrollment card.
 * Lives on the staff Settings page so any signed-in staff member can enroll
 * or unenroll their own TOTP factor.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMfaStatus, useMfaPolicy, mfaRequiredForRole, useMfaEnrollmentRequirement, revokeDeviceTrust } from "@/hooks/useMfa";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import { MfaEnrollDialog } from "./MfaEnrollDialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function StaffMfaCard() {
  const { role, user } = useAuth();
  const status = useMfaStatus();
  const policy = useMfaPolicy();
  const req = useMfaEnrollmentRequirement();
  const logAudit = useLogStaffAudit();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  const required = mfaRequiredForRole(role, policy);

  const handleUnenroll = async () => {
    if (!status.factorId) return;
    if (required) {
      toast.error("Your role requires MFA, so it can't be turned off.");
      return;
    }
    if (!confirm("Disable two-factor authentication? You can re-enable it later.")) return;
    setUnenrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: status.factorId });
      if (error) {
        toast.error(error.message);
        return;
      }
      logAudit.mutate({
        eventType: "mfa_disabled",
        severity: "high",
        reason: "User unenrolled TOTP factor",
      });
      revokeDeviceTrust(user?.id);
      toast.success("MFA disabled.");
      await status.refresh();
    } finally {
      setUnenrolling(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {status.verified ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <ShieldAlert className={`h-4 w-4 ${required ? "text-destructive" : "text-muted-foreground"}`} />
            )}
            Two-factor authentication
            {status.verified && (
              <Badge variant="outline" className="ml-auto text-xs border-primary/40 text-primary">
                Enabled
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status.verified ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your account is protected by an authenticator app. This device stays trusted for{" "}
                {policy.trustWindowHours} hours, so you won't be asked for a code on every page.
              </p>
              {required && (
                <p className="text-xs text-muted-foreground">
                  Admin accounts require MFA, so it can't be turned off here.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnenroll}
                disabled={unenrolling || required}
              >
                {unenrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Disable MFA
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {required
                  ? "Your role requires MFA. Enroll an authenticator app to keep access."
                  : "Add a second factor to protect your account."}
              </p>
              {required && req.graceEndsAt && (
                <p className="text-xs">
                  {req.inGrace ? (
                    <span className="text-orange-600 dark:text-orange-400">
                      Grace period ends {formatDistanceToNow(req.graceEndsAt, { addSuffix: true })}.
                    </span>
                  ) : (
                    <span className="text-destructive">
                      Grace period expired — enrollment is overdue.
                    </span>
                  )}
                </p>
              )}
              <Button size="sm" onClick={() => setEnrollOpen(true)}>
                Enable two-factor authentication
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <MfaEnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onEnrolled={() => void status.refresh()}
      />
    </>
  );
}
