import { useState } from "react";
import { AlertTriangle, Shield, CheckCircle2, Clock, MessageSquare, UserCheck, Loader2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateAssistMode, logPickupAction, type AssistMode } from "@/hooks/useAirportPickups";
import { useToast } from "@/hooks/use-toast";
import { permissions } from "@/lib/permissions";

const MODE_CONFIG: Record<AssistMode, {
  label: string;
  icon: typeof Shield;
  containerClass: string;
  badgeClass: string;
}> = {
  healthy: {
    label: "System Healthy",
    icon: CheckCircle2,
    containerClass: "bg-[hsl(var(--success)/0.06)] border-[hsl(var(--success)/0.2)]",
    badgeClass: "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]",
  },
  degraded: {
    label: "Reduced Confidence",
    icon: Clock,
    containerClass: "bg-warning/5 border-warning/20",
    badgeClass: "bg-warning/10 text-warning-foreground",
  },
  manual_assist: {
    label: "Manual Assist Active",
    icon: AlertTriangle,
    containerClass: "bg-destructive/5 border-destructive/20",
    badgeClass: "bg-destructive/10 text-destructive",
  },
  recovery_pending: {
    label: "Recovery Pending",
    icon: Shield,
    containerClass: "bg-primary/5 border-primary/20",
    badgeClass: "bg-primary/10 text-primary",
  },
};

interface Props {
  bookingId: string;
  pickupId: string;
  assistMode: AssistMode;
  assistReason: string | null;
  guestName?: string | null;
  /** Callback when "Contact Guest" is tapped */
  onContactGuest?: () => void;
  /** Compact mode for widget views */
  compact?: boolean;
}

export function ManualAssistBanner({
  bookingId, pickupId, assistMode, assistReason, guestName,
  onContactGuest, compact = false,
}: Props) {
  const { role, user } = useAuth();
  const updateAssist = useUpdateAssistMode();
  const { toast } = useToast();
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");

  if (assistMode === "healthy") return null;

  const config = MODE_CONFIG[assistMode];
  const Icon = config.icon;
  const canManage = permissions.canTransitionState(role);
  const isAdmin = role === "admin";
  const isManagerPlus = role === "admin" || role === "manager";

  const handleEscalateToManual = async () => {
    try {
      await updateAssist.mutateAsync({
        booking_id: bookingId,
        pickup_id: pickupId,
        assist_mode: "manual_assist",
        assist_reason: escalateReason.trim() || assistReason || "Escalated by staff.",
        activated_by: user?.id ?? null,
      });
      await logPickupAction({
        bookingId,
        pickupId,
        action: "[MANUAL] assist_escalated",
        note: `Manual assist activated: ${escalateReason.trim() || "Escalated from degraded state"}`,
      });
      toast({ title: "Manual assist activated" });
      setShowEscalate(false);
      setEscalateReason("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleResumeAutomation = async () => {
    try {
      await updateAssist.mutateAsync({
        booking_id: bookingId,
        pickup_id: pickupId,
        assist_mode: "healthy",
        assist_reason: null,
        resolved_by: user?.id ?? null,
      });
      await logPickupAction({
        bookingId,
        pickupId,
        action: "[MANUAL] assist_resolved",
        note: "Admin approved return to automation.",
      });
      toast({ title: "Automation resumed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleMarkRecoveryReady = async () => {
    try {
      await updateAssist.mutateAsync({
        booking_id: bookingId,
        pickup_id: pickupId,
        assist_mode: "recovery_pending",
        assist_reason: "System ready — waiting for approval to resume automation.",
      });
      toast({ title: "Marked as recovery ready" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${config.containerClass}`}>
        <Icon className="h-3 w-3 shrink-0" />
        <span className="font-medium">{config.label}</span>
        {assistReason && <span className="text-muted-foreground truncate">— {assistReason}</span>}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${config.containerClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="text-sm font-semibold">{config.label}</span>
        </div>
        <Badge className={config.badgeClass}>
          {assistMode === "manual_assist" ? "Automation Paused" :
           assistMode === "recovery_pending" ? "Awaiting Approval" :
           "Pay Attention"}
        </Badge>
      </div>

      {/* Reason — plain English */}
      {assistReason && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {assistReason}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5">
        {/* Contact Guest — available in degraded and manual_assist */}
        {(assistMode === "degraded" || assistMode === "manual_assist") && canManage && onContactGuest && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onContactGuest}
          >
            <MessageSquare className="h-3 w-3" />
            Contact {guestName ?? "Guest"}
          </Button>
        )}

        {/* Escalate to manual — from degraded, manager+ */}
        {assistMode === "degraded" && isManagerPlus && (
          <>
            {!showEscalate ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
                onClick={() => setShowEscalate(true)}
              >
                <AlertTriangle className="h-3 w-3" />
                Activate Manual Assist
              </Button>
            ) : (
              <div className="w-full space-y-1.5 mt-1">
                <Textarea
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder="Brief reason (optional)..."
                  className="h-14 text-xs"
                />
                <div className="flex gap-1">
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleEscalateToManual} disabled={updateAssist.isPending}>
                    {updateAssist.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowEscalate(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Mark recovery ready — from manual_assist, manager+ */}
        {assistMode === "manual_assist" && isManagerPlus && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-primary/30"
            onClick={handleMarkRecoveryReady}
            disabled={updateAssist.isPending}
          >
            <Shield className="h-3 w-3" />
            System Ready — Request Approval
          </Button>
        )}

        {/* Resume automation — recovery_pending, admin only */}
        {assistMode === "recovery_pending" && isAdmin && (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleResumeAutomation}
            disabled={updateAssist.isPending}
          >
            {updateAssist.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Resume Automation
          </Button>
        )}
      </div>

      {/* Staff indicator for manual updates */}
      {assistMode === "manual_assist" && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <UserCheck className="h-3 w-3" />
          All changes below will be marked as "Confirmed by staff"
        </p>
      )}
    </div>
  );
}
