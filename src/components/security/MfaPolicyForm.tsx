/**
 * Admin form for the MFA enforcement policy.
 * Writes to policy_settings (global scope, property_id IS NULL) and logs an
 * audit event for every change.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMfaPolicy } from "@/hooks/useMfa";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StepUpDialog } from "./StepUpDialog";
import { isStepUpFresh } from "@/hooks/useMfa";

const FIELDS = [
  { key: "mfa_required_admin", label: "Require MFA for admins/owners", kind: "bool" as const },
  { key: "mfa_required_manager", label: "Require MFA for managers", kind: "bool" as const },
  { key: "mfa_required_staff", label: "Require MFA for all staff", kind: "bool" as const },
  { key: "mfa_required_sensitive_actions", label: "Require MFA for sensitive actions (refunds, role changes, security settings)", kind: "bool" as const },
  { key: "mfa_grace_period_days", label: "Grace period (days)", kind: "num" as const },
] as const;

export function MfaPolicyForm() {
  const { user, isAdmin } = useAuth();
  const policy = useMfaPolicy();
  const qc = useQueryClient();
  const logAudit = useLogStaffAudit();

  const [local, setLocal] = useState({
    mfa_required_admin: true,
    mfa_required_manager: true,
    mfa_required_staff: false,
    mfa_required_sensitive_actions: true,
    mfa_grace_period_days: 7,
  });
  const [saving, setSaving] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  useEffect(() => {
    setLocal({
      mfa_required_admin: policy.requiredForAdmin,
      mfa_required_manager: policy.requiredForManager,
      mfa_required_staff: policy.requiredForStaff,
      mfa_required_sensitive_actions: policy.requireForSensitiveActions,
      mfa_grace_period_days: policy.gracePeriodDays,
    });
  }, [policy]);

  if (!isAdmin) return null;

  const doSave = async () => {
    setSaving(true);
    try {
      // Upsert each global (property_id IS NULL) policy row
      for (const f of FIELDS) {
        const value =
          f.kind === "bool"
            ? (local[f.key] as boolean)
            : Number(local[f.key]);
        // Find existing global row
        const { data: existing } = await supabase
          .from("policy_settings")
          .select("id, value")
          .eq("key", f.key)
          .is("property_id", null)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("policy_settings")
            .update({ value: value as any, updated_by: user?.id })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("policy_settings")
            .insert({ key: f.key, value: value as any, updated_by: user?.id });
        }
      }
      logAudit.mutate({
        eventType: "mfa_policy_changed",
        severity: "high",
        reason: "Admin updated MFA policy",
        metadata: local,
      });
      qc.invalidateQueries({ queryKey: ["policy-settings"] });
      toast.success("MFA policy saved.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (policy.requireForSensitiveActions && !isStepUpFresh()) {
      setStepUpOpen(true);
      return;
    }
    void doSave();
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            MFA enforcement policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {FIELDS.filter((f) => f.kind === "bool").map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-4">
              <Label htmlFor={f.key} className="text-sm leading-snug">
                {f.label}
              </Label>
              <Switch
                id={f.key}
                checked={local[f.key] as boolean}
                onCheckedChange={(v) => setLocal((s) => ({ ...s, [f.key]: v }))}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="mfa_grace_period_days" className="text-sm">
              Grace period (days) before enforcement blocks sign-in
            </Label>
            <Input
              id="mfa_grace_period_days"
              type="number"
              min={0}
              max={90}
              className="w-24"
              value={local.mfa_grace_period_days}
              onChange={(e) =>
                setLocal((s) => ({ ...s, mfa_grace_period_days: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save policy
            </Button>
          </div>
        </CardContent>
      </Card>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        action="changing the MFA policy"
        onVerified={doSave}
      />
    </>
  );
}
