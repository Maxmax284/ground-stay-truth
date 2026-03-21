import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTransitionBookingState, useBookingPayments, useCreatePayment } from "@/hooks/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { getDepositPolicy } from "@/lib/depositPolicy";
import { calculateRefund } from "@/lib/refundCalculator";
import { useBufferViolation, useEarlyCheckinRequest } from "@/hooks/useEarlyCheckin";
import { EarlyCheckinApproval } from "@/components/EarlyCheckinApproval";
import { getValidTransitions, getAllTransitions, type BookingState } from "@/lib/bookingStateMachine";
import { AlertTriangle, ShieldAlert, DollarSign, Sparkles, Loader2, CreditCard } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { useAISettings } from "@/hooks/useAISettings";
import { useAIAssistant } from "@/hooks/useAIAssistant";
import { createNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";

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

  const { data: existingPayments } = useBookingPayments(bookingId);
  const createPayment = useCreatePayment();

  const [adminOverride, setAdminOverride] = useState(false);
  const [depositOverride, setDepositOverride] = useState(false);
  const [depositOverrideReason, setDepositOverrideReason] = useState("");
  const [targetState, setTargetState] = useState<BookingState | "">("");
  const [reason, setReason] = useState("");
  const [aiValidation, setAiValidation] = useState<string | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const [aiAcknowledged, setAiAcknowledged] = useState(false);

  // Deposit form state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState("cash");
  const [depositNotes, setDepositNotes] = useState("");

  // Cash at check-in state
  const [cashAtCheckin, setCashAtCheckin] = useState(false);
  const [checkinPayAmount, setCheckinPayAmount] = useState("");
  const [checkinPayMethod, setCheckinPayMethod] = useState("cash");
  const [checkinPayNotes, setCheckinPayNotes] = useState("");

  const canOverride = permissions.canAdminOverride(role);
  const canCheckIn = permissions.canCompleteCheckIn(role);
  const canCheckOut = permissions.canCompleteCheckOut(role);
  const canRecordPay = permissions.canRecordPayment(role);
  const canDepositOverride = permissions.canOverrideDeposit(role);
  const hasDocuments = (documents?.length ?? 0) > 0;
  const hasPayments = (existingPayments?.length ?? 0) > 0;

  // Deposit policy
  const depositPolicy = useMemo(() => getDepositPolicy(policies), [policies]);

  // Deposit calculation
  const depositPercentage = useMemo(() => {
    const setting = policies?.find((p) => p.key === "deposit_percentage");
    return setting ? Number(setting.value) : 100;
  }, [policies]);

  const requiredDeposit = useMemo(() => {
    if (!totalPrice) return null;
    return (totalPrice * depositPercentage) / 100;
  }, [totalPrice, depositPercentage]);

  // Determine if manual deposit form should show
  const isPendingDepositToConfirmed = currentState === "pending_deposit" && targetState === "confirmed";
  const manualAllowed = depositPolicy.effectiveMode !== "online_required" || depositOverride;
  const showDepositForm = isPendingDepositToConfirmed && !hasPayments && canRecordPay && manualAllowed;

  // Show override toggle when online is required and user has permission
  const showDepositOverrideToggle = isPendingDepositToConfirmed && depositPolicy.effectiveMode === "online_required" && canDepositOverride && !hasPayments;

  // Pre-fill deposit amount
  useEffect(() => {
    if (showDepositForm && requiredDeposit != null && !depositAmount) {
      setDepositAmount(requiredDeposit.toFixed(2));
    }
  }, [showDepositForm, requiredDeposit]);

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
        const ctx = { bookingId, currentState, targetState, hasDocuments, bufferViolated, checkInDate, depositPolicy: depositPolicy.effectiveMode };
        const { data: { session: s } } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
        const token = s?.access_token ?? "";
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ mode: "validate", role, messages: [{ role: "user", content: `Validate transition from ${currentState} to ${targetState}. Documents uploaded: ${hasDocuments}. Buffer violated: ${bufferViolated}. Check-in date: ${checkInDate ?? "N/A"}. Deposit policy: ${depositPolicy.effectiveMode}. Payments recorded: ${hasPayments}.` }], context: ctx }),
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

  // Critical transitions that require admin sign-off
  const ADMIN_GATED_TRANSITIONS: Array<{ from: BookingState; to: BookingState }> = [
    { from: "pending_approval", to: "pending_deposit" },
    { from: "pending_approval", to: "cancelled" },
    { from: "pending_deposit", to: "confirmed" },
    { from: "inquiry", to: "cancelled" },
  ];

  const isAdminGated = (from: BookingState, to: BookingState) =>
    ADMIN_GATED_TRANSITIONS.some((t) => t.from === from && t.to === to);

  const canApproveTransition = permissions.canApproveStateTransition(role);

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

  // Block confirmation if online required, no payment, and no override
  const depositBlocked = isPendingDepositToConfirmed && depositPolicy.effectiveMode === "online_required" && !hasPayments && !depositOverride;

  // Request admin approval for gated transitions (non-admin)
  const handleRequestApproval = async () => {
    if (!targetState || !reason.trim()) {
      toast({ title: t("stateTransition.reasonRequired"), description: t("stateTransition.reasonDesc"), variant: "destructive" });
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user?.id ?? "")
        .single();
      const senderName = profile?.full_name ?? "Staff";

      // Log as recommendation
      await supabase.from("booking_state_log").insert({
        booking_id: bookingId,
        from_state: currentState,
        to_state: currentState, // no actual transition
        changed_by: user?.id ?? null,
        reason: `[TRANSITION REQUEST] ${senderName} requests ${currentState} → ${targetState}: ${reason}`,
      });

      // Notify admins
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      await createNotifications(
        (admins ?? [])
          .filter((a) => a.user_id !== user?.id)
          .map((a) => ({
            user_id: a.user_id,
            type: "booking",
            reference_id: bookingId,
            message: `${senderName} requests transition: ${currentState} → ${targetState} — "${reason}"`,
          }))
      );

      toast({ title: t("stateTransition.approvalRequested"), description: t("stateTransition.approvalRequestedDesc") });
      setTargetState("");
      setReason("");
    } catch (err: any) {
      toast({ title: t("stateTransition.transitionFailed"), description: err.message, variant: "destructive" });
    }
  };

  const handleTransition = async () => {
    if (!targetState) return;
    if (!reason.trim()) { toast({ title: t("stateTransition.reasonRequired"), description: t("stateTransition.reasonDesc"), variant: "destructive" }); return; }
    if (checkInBlocked) { toast({ title: t("documents.idDocuments"), description: t("stateTransition.docsRequired"), variant: "destructive" }); return; }
    if (checkInBufferBlocked) { toast({ title: t("earlyCheckin.cleaningViolation"), description: t("stateTransition.bufferBlocked"), variant: "destructive" }); return; }

    // Validate deposit override reason
    if (depositOverride && !depositOverrideReason.trim()) {
      toast({ title: t("deposit.overrideReasonRequired"), variant: "destructive" });
      return;
    }

    // If deposit form is showing, record payment first
    if (showDepositForm) {
      if (!depositAmount || Number(depositAmount) <= 0) {
        toast({ title: t("payments.enterValidAmount"), variant: "destructive" });
        return;
      }
      try {
        const sourceChannel = depositOverride ? "supervisor_override" : "front_desk";
        await createPayment.mutateAsync({
          booking_id: bookingId,
          amount: Number(depositAmount),
          method: depositMethod,
          notes: depositNotes || undefined,
          source_channel: sourceChannel,
        });

        // If override was used, notify admins
        if (depositOverride) {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin"]);
          await createNotifications(
            (admins ?? [])
              .filter((a) => a.user_id !== user?.id)
              .map((a) => ({
                user_id: a.user_id,
                type: "booking",
                reference_id: bookingId,
                message: `Manager deposit override used. Reason: ${depositOverrideReason}`,
              }))
          );
        }
      } catch (err: any) {
        toast({ title: t("stateTransition.transitionFailed"), description: err.message, variant: "destructive" });
        return;
      }
    }

    try {
      const reasonText = [
        adminOverride ? "[ADMIN OVERRIDE]" : "",
        depositOverride ? `[MANAGER DEPOSIT OVERRIDE] ${depositOverrideReason}` : "",
        earlyCheckinApproved && targetState === "checked_in" ? "[EARLY CHECK-IN APPROVED]" : "",
        showDepositForm ? `[DEPOSIT: ${formatPrice(Number(depositAmount), policies)} via ${depositMethod}]` : "",
        reason,
        refundInfo ? `[Refund: ${refundInfo.label}${refundInfo.refundAmount != null ? ` — ${formatPrice(refundInfo.refundAmount, policies)}` : ""}]` : "",
      ].filter(Boolean).join(" ");
      await transition.mutateAsync({ bookingId, fromState: currentState, toState: targetState as BookingState, reason: reasonText });
      toast({ title: t("stateTransition.stateUpdated"), description: t("stateTransition.movedTo", { state: t(`states.${targetState}`) }) });
      // Trigger confirmation notification when booking moves to confirmed
      if (targetState === "confirmed") {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-confirmation`, {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ booking_id: bookingId }),
            }).catch(console.error);
          }
        } catch {}
      }
      setTargetState(""); setReason(""); setAdminOverride(false); setDepositOverride(false); setDepositOverrideReason("");
      setDepositAmount(""); setDepositMethod("cash"); setDepositNotes("");
    } catch (err: any) { toast({ title: t("stateTransition.transitionFailed"), description: err.message, variant: "destructive" }); }
  };

  // Determine if current target is admin-gated and user is not admin
  const targetIsGated = !!targetState && isAdminGated(currentState, targetState as BookingState) && !canApproveTransition && !adminOverride;

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
                {refundInfo.refundAmount != null && <p className="text-xs mt-1">{t("refund.refundAmount")}: <strong>{formatPrice(refundInfo.refundAmount, policies)}</strong>{totalPrice != null && ` ${t("refund.ofTotal", { total: formatPrice(totalPrice, policies) })}`}</p>}
              </div>
            </div>
          )}
          {/* Online deposit required warning */}
          {isPendingDepositToConfirmed && depositPolicy.effectiveMode === "online_required" && !hasPayments && !depositOverride && (
            <div className="flex items-center gap-2 text-sm text-warning-foreground bg-warning/10 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("deposit.onlineRequired")}</span>
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
          {/* Manager deposit override toggle */}
          {showDepositOverrideToggle && (
            <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="deposit-override" className="text-sm font-medium">{t("deposit.managerOverride")}</Label>
                <Switch id="deposit-override" checked={depositOverride} onCheckedChange={setDepositOverride} />
              </div>
              <p className="text-xs text-muted-foreground">{t("deposit.managerOverrideDesc")}</p>
              {depositOverride && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("deposit.overrideReason")} *</Label>
                  <Textarea
                    value={depositOverrideReason}
                    onChange={(e) => setDepositOverrideReason(e.target.value)}
                    placeholder={t("deposit.overrideReasonPlaceholder")}
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
          {/* Inline deposit form */}
          {showDepositForm && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CreditCard className="h-4 w-4" />
                {t("deposit.collectPrompt")}
              </div>
              {requiredDeposit != null && (
                <p className="text-xs text-muted-foreground">
                  {t("deposit.requiredAmount", { amount: formatPrice(requiredDeposit, policies), percentage: depositPercentage })}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("payments.amount")} *</Label>
                  <Input type="number" step="0.01" min="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("payments.method")}</Label>
                  <Select value={depositMethod} onValueChange={setDepositMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t("payments.methods.cash")}</SelectItem>
                      <SelectItem value="card">{t("payments.methods.card")}</SelectItem>
                      <SelectItem value="bank_transfer">{t("payments.methods.bank_transfer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea placeholder={t("payments.paymentNotes")} value={depositNotes} onChange={(e) => setDepositNotes(e.target.value)} rows={1} />
            </div>
          )}
          <div className="space-y-1"><Label className="text-xs">{t("stateTransition.reasonLabel")} *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("stateTransition.reasonPlaceholder")} rows={2} /></div>
          {targetIsGated && (
            <div className="flex items-center gap-2 text-sm text-warning-foreground bg-warning/10 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("stateTransition.adminApprovalRequired")}</span>
            </div>
          )}
          <Button
            onClick={targetIsGated ? handleRequestApproval : handleTransition}
            disabled={!targetState || !reason.trim() || transition.isPending || createPayment.isPending || checkInBlocked || checkInBufferBlocked || (depositBlocked && !targetIsGated)}
            size="sm"
            className="w-full"
            variant={targetIsGated ? "outline" : "default"}
          >
            {(transition.isPending || createPayment.isPending)
              ? t("common.updating")
              : targetIsGated
                ? t("stateTransition.requestApproval")
                : showDepositForm
                  ? t("deposit.recordAndConfirm")
                  : t("stateTransition.confirmTransition")}
          </Button>
        </>
      )}
    </div>
  );
}
