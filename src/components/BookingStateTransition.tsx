import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { calculateRefund } from "@/lib/refundCalculator";
import { useBufferViolation, useEarlyCheckinRequest } from "@/hooks/useEarlyCheckin";
import { EarlyCheckinApproval } from "@/components/EarlyCheckinApproval";
import { getValidTransitions, getAllTransitions, type BookingState } from "@/lib/bookingStateMachine";
import { AlertTriangle, ShieldAlert, DollarSign, Sparkles, Loader2 } from "lucide-react";
import { useAISettings } from "@/hooks/useAISettings";
import { useAIAssistant } from "@/hooks/useAIAssistant";

interface BookingStateTransitionProps { bookingId: string; currentState: BookingState; isAdmin: boolean; checkInDate?: string; totalPrice?: number | null; unitId?: string; }

export function BookingStateTransition({ bookingId, currentState, isAdmin, checkInDate, totalPrice, unitId }: BookingStateTransitionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role } = useAuth();
  const transition = useTransitionBookingState();
  const { data: documents } = useGuestDocuments(bookingId);
  const { data: policies } = usePolicySettings();
  const { isAIEnabled } = useAISettings(role);
  const aiAssistant = useAIAssistant();

  const [adminOverride, setAdminOverride] = useState(false);
  const [targetState, setTargetState] = useState<BookingState | "">("");
  const [reason, setReason] = useState("");
  const [aiValidation, setAiValidation] = useState<string | null>(null);
  const [aiChecking, setAiChecking] = useState(false);

  const canOverride = permissions.canAdminOverride(role);
  const canCheckIn = permissions.canCompleteCheckIn(role);
  const canCheckOut = permissions.canCompleteCheckOut(role);
  const hasDocuments = (documents?.length ?? 0) > 0;

  const cleaningBufferHours = useMemo(() => {
    const setting = policies?.find((p) => p.key === "cleaning_buffer_hours");
    return setting ? Number(setting.value) : 4;
  }, [policies]);

  const { data: bufferViolation } = useBufferViolation(unitId ?? null, bookingId, checkInDate ?? null, cleaningBufferHours);
  const { data: earlyCheckinRequest } = useEarlyCheckinRequest(bookingId);

  const bufferViolated = bufferViolation?.violated ?? false;
  const earlyCheckinApproved = earlyCheckinRequest?.status === "approved";

  const refundInfo = useMemo(() => {
    if (targetState !== "cancelled" || !checkInDate || !policies) return null;
    return calculateRefund(checkInDate, totalPrice ?? null, policies);
  }, [targetState, checkInDate, totalPrice, policies]);

  // AI Pre-flight check when target state changes
  useEffect(() => {
    if (!targetState || !isAIEnabled) {
      setAiValidation(null);
      return;
    }
    let cancelled = false;
    const runCheck = async () => {
      setAiChecking(true);
      setAiValidation(null);
      try {
        const ctx = { bookingId, currentState, targetState, hasDocuments, bufferViolated, checkInDate };
        const { data: { session: s } } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
        const token = s?.access_token ?? "";
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ mode: "validate", role, messages: [{ role: "user", content: `Validate transition from ${currentState} to ${targetState}. Documents uploaded: ${hasDocuments}. Buffer violated: ${bufferViolated}. Check-in date: ${checkInDate ?? "N/A"}.` }], context: ctx }),
          }
        );
        if (!resp.ok || !resp.body) { setAiChecking(false); return; }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            let line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") break;
            try { const p = JSON.parse(json); const c = p.choices?.[0]?.delta?.content; if (c) text += c; } catch {}
          }
        }
        if (!cancelled) setAiValidation(text || null);
      } catch {
        // Silently fail — advisory only
      } finally {
        if (!cancelled) setAiChecking(false);
      }
    };
    runCheck();
    return () => { cancelled = true; };
  }, [targetState, isAIEnabled]);

  const rawTransitions = adminOverride ? getAllTransitions(currentState) : getValidTransitions(currentState);
  const validStates = rawTransitions.filter((s) => {
    if (s === "checked_in" && !canCheckIn) return false;
    if (s === "completed" && !canCheckOut) return false;
    return true;
  });

  const filteredCheckIn = rawTransitions.includes("checked_in") && !canCheckIn;
  const filteredCheckOut = rawTransitions.includes("completed") && !canCheckOut;

  if (!permissions.canTransitionState(role)) return null;
  if (validStates.length === 0 && !canOverride) {
    if (filteredCheckIn || filteredCheckOut) {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {filteredCheckIn ? t("stateTransition.supervisorCheckIn") : t("stateTransition.supervisorCheckOut")}
          </div>
          {filteredCheckIn && bufferViolated && <EarlyCheckinApproval bookingId={bookingId} hoursShort={bufferViolation?.hoursShort ?? 0} isViolated={bufferViolated} />}
        </div>
      );
    }
    return null;
  }

  const checkInBlocked = targetState === "checked_in" && !hasDocuments && !adminOverride;
  const checkInBufferBlocked = targetState === "checked_in" && bufferViolated && !earlyCheckinApproved && !adminOverride;

  const handleTransition = async () => {
    if (!targetState) return;
    if (!reason.trim()) { toast({ title: t("stateTransition.reasonRequired"), description: t("stateTransition.reasonDesc"), variant: "destructive" }); return; }
    if (checkInBlocked) { toast({ title: t("documents.idDocuments"), description: t("stateTransition.docsRequired"), variant: "destructive" }); return; }
    if (checkInBufferBlocked) { toast({ title: t("earlyCheckin.cleaningViolation"), description: t("stateTransition.bufferBlocked"), variant: "destructive" }); return; }
    try {
      const reasonText = [
        adminOverride ? "[ADMIN OVERRIDE]" : "",
        earlyCheckinApproved && targetState === "checked_in" ? "[EARLY CHECK-IN APPROVED]" : "",
        reason,
        refundInfo ? `[Refund: ${refundInfo.label}${refundInfo.refundAmount != null ? ` — $${refundInfo.refundAmount.toFixed(2)}` : ""}]` : "",
      ].filter(Boolean).join(" ");
      await transition.mutateAsync({ bookingId, fromState: currentState, toState: targetState as BookingState, reason: reasonText });
      toast({ title: t("stateTransition.stateUpdated"), description: t("stateTransition.movedTo", { state: t(`states.${targetState}`) }) });
      setTargetState(""); setReason(""); setAdminOverride(false);
    } catch (err: any) { toast({ title: t("stateTransition.transitionFailed"), description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t("stateTransition.changeState")}</h4>
        {canOverride && validStates.length === 0 && !adminOverride && <p className="text-xs text-muted-foreground">{t("stateTransition.noTransitions")}</p>}
        {canOverride && (
          <div className="flex items-center gap-2">
            <Label htmlFor="admin-override" className="text-xs text-muted-foreground">{t("stateTransition.adminOverride")}</Label>
            <Switch id="admin-override" checked={adminOverride} onCheckedChange={setAdminOverride} />
          </div>
        )}
      </div>
      {bufferViolated && currentState === "confirmed" && <EarlyCheckinApproval bookingId={bookingId} hoursShort={bufferViolation?.hoursShort ?? 0} isViolated={bufferViolated} />}
      {(validStates.length > 0) && (
        <>
          <Select value={targetState} onValueChange={(v) => setTargetState(v as BookingState)}>
            <SelectTrigger><SelectValue placeholder={t("stateTransition.selectNextState")} /></SelectTrigger>
            <SelectContent>{validStates.map((s) => <SelectItem key={s} value={s}>{t(`states.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
          {targetState === "checked_in" && !hasDocuments && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3"><ShieldAlert className="h-4 w-4 shrink-0" /><span>{t("stateTransition.docsRequired")}</span></div>
          )}
          {targetState === "checked_in" && checkInBufferBlocked && (
            <div className="flex items-center gap-2 text-sm text-warning-foreground bg-warning/10 rounded-md p-3"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{t("stateTransition.bufferBlocked")}</span></div>
          )}
          {refundInfo && (
            <div className={`flex items-start gap-2 text-sm rounded-md p-3 ${refundInfo.tier === "free" ? "bg-success/10 text-[hsl(var(--success))]" : refundInfo.tier === "partial" ? "bg-warning/10 text-warning-foreground" : "bg-destructive/10 text-destructive"}`}>
              <DollarSign className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{refundInfo.label}</p>
                {refundInfo.refundAmount != null && <p className="text-xs mt-1">{t("refund.refundAmount")}: <strong>${refundInfo.refundAmount.toFixed(2)}</strong>{totalPrice != null && ` ${t("refund.ofTotal", { total: totalPrice.toFixed(2) })}`}</p>}
              </div>
            </div>
          )}
          {(aiChecking || aiValidation) && (
            <div className="flex items-start gap-2 text-sm rounded-md p-3 bg-accent/50 text-accent-foreground border border-accent">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-xs mb-1">{t("ai.preFlightTitle")}</p>
                {aiChecking ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t("ai.preFlightLoading")}</div>
                ) : (
                  <p className="text-xs whitespace-pre-wrap">{aiValidation}</p>
                )}
              </div>
            </div>
          )}
          <div className="space-y-1"><Label className="text-xs">{t("stateTransition.reasonLabel")} *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("stateTransition.reasonPlaceholder")} rows={2} /></div>
          <Button onClick={handleTransition} disabled={!targetState || !reason.trim() || transition.isPending || checkInBlocked || checkInBufferBlocked} size="sm" className="w-full">
            {transition.isPending ? t("common.updating") : t("stateTransition.confirmTransition")}
          </Button>
        </>
      )}
    </div>
  );
}
