import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useEarlyCheckinRequest, useCreateEarlyCheckinRequest, useResolveEarlyCheckinRequest } from "@/hooks/useEarlyCheckin";
import { AlertTriangle, Clock, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";

interface EarlyCheckinApprovalProps { bookingId: string; hoursShort: number; isViolated: boolean; }

export function EarlyCheckinApproval({ bookingId, hoursShort, isViolated }: EarlyCheckinApprovalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role } = useAuth();
  const { data: existingRequest, isLoading } = useEarlyCheckinRequest(bookingId);
  const createRequest = useCreateEarlyCheckinRequest();
  const resolveRequest = useResolveEarlyCheckinRequest();
  const [escalationReason, setEscalationReason] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [showEscalate, setShowEscalate] = useState(false);
  const canApprove = permissions.canApproveOverride(role);

  if (!isViolated || isLoading) return null;

  if (existingRequest?.status === "approved") {
    return (<div className="flex items-center gap-2 text-sm bg-success/10 text-[hsl(var(--success))] rounded-md p-3"><CheckCircle2 className="h-4 w-4 shrink-0" /><div><p className="font-medium">{t("earlyCheckin.approved")}</p>{existingRequest.response_note && <p className="text-xs mt-0.5 opacity-80">{existingRequest.response_note}</p>}</div></div>);
  }

  if (existingRequest?.status === "denied") {
    return (<div className="flex items-center gap-2 text-sm bg-destructive/10 text-destructive rounded-md p-3"><XCircle className="h-4 w-4 shrink-0" /><div><p className="font-medium">{t("earlyCheckin.denied")}</p>{existingRequest.response_note && <p className="text-xs mt-0.5">{existingRequest.response_note}</p>}<p className="text-xs mt-1 text-muted-foreground">{t("earlyCheckin.deniedNote")}</p></div></div>);
  }

  if (existingRequest?.status === "pending") {
    return (
      <div className="space-y-3 rounded-md border border-warning/30 bg-warning/5 p-3">
        <div className="flex items-center gap-2 text-sm text-warning-foreground"><Clock className="h-4 w-4 shrink-0" /><div><p className="font-medium">{t("earlyCheckin.pendingTitle")}</p><p className="text-xs mt-0.5 text-muted-foreground">{t("earlyCheckin.bufferViolation", { hours: hoursShort })}</p></div></div>
        {canApprove && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs font-medium">{t("earlyCheckin.managerResponse")}</Label>
            <Textarea value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder={t("earlyCheckin.responsePlaceholder")} rows={2} />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={async () => { try { await resolveRequest.mutateAsync({ requestId: existingRequest.id, bookingId, status: "approved", responseNote: responseNote || undefined }); toast({ title: t("earlyCheckin.approved") }); setResponseNote(""); } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); } }} disabled={resolveRequest.isPending}><CheckCircle2 className="h-4 w-4 mr-1" />{t("earlyCheckin.approve")}</Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={async () => { try { await resolveRequest.mutateAsync({ requestId: existingRequest.id, bookingId, status: "denied", responseNote: responseNote || undefined }); toast({ title: t("earlyCheckin.denied") }); setResponseNote(""); } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); } }} disabled={resolveRequest.isPending}><XCircle className="h-4 w-4 mr-1" />{t("earlyCheckin.deny")}</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start gap-2 text-sm text-warning-foreground"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><div><p className="font-medium">{t("earlyCheckin.cleaningViolation")}</p><p className="text-xs mt-0.5 text-muted-foreground">{t("earlyCheckin.violationDesc", { hours: hoursShort })}</p></div></div>
      {!showEscalate ? (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setShowEscalate(true)}><ArrowUpRight className="h-4 w-4 mr-1" />{t("earlyCheckin.requestApproval")}</Button>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">{t("earlyCheckin.reasonForEarly")} *</Label>
          <Textarea value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} placeholder={t("earlyCheckin.explainReason")} rows={2} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={async () => { if (!escalationReason.trim()) { toast({ title: t("stateTransition.reasonRequired"), variant: "destructive" }); return; } try { await createRequest.mutateAsync({ bookingId, reason: escalationReason.trim(), bufferViolationHours: hoursShort }); toast({ title: t("earlyCheckin.escalationSent"), description: t("earlyCheckin.escalationDesc") }); setEscalationReason(""); setShowEscalate(false); } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); } }} disabled={createRequest.isPending || !escalationReason.trim()}>{createRequest.isPending ? t("common.sending") : t("earlyCheckin.sendEscalation")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowEscalate(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
