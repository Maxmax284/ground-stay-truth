import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllMaintenanceRequests, useUpdateMaintenanceStatus, useOverrideMaintenanceStatus } from "@/hooks/useMaintenanceRequests";
import { useAuth } from "@/hooks/useAuth";
import { useRolePreview } from "@/hooks/useRolePreview";
import { permissions } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wrench, Play, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
};

const MAINTENANCE_STATUSES = ["open", "in_progress", "resolved"];

export function MaintenanceQueue() {
  const { t } = useTranslation();
  const { role: actualRole } = useAuth();
  const { effectiveRole } = useRolePreview();
  const [showResolved, setShowResolved] = useState(false);
  const statusFilter = showResolved ? undefined : ["open", "in_progress"];
  const { data: requests, isLoading } = useAllMaintenanceRequests(statusFilter);
  const updateStatus = useUpdateMaintenanceStatus();
  const overrideStatus = useOverrideMaintenanceStatus();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const canResolve = permissions.canResolveMaintenanceRequest(effectiveRole);
  const canUpdateStatus = permissions.canUpdateMaintenanceStatus(effectiveRole);
  const canOverride = permissions.canOverrideStaySupport(effectiveRole);

  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideResNote, setOverrideResNote] = useState("");

  const handleStart = async (req: any) => {
    try {
      await updateStatus.mutateAsync({
        id: req.id,
        booking_id: req.booking_id,
        from_status: "open",
        to_status: "in_progress",
      });
      toast.success(t("staySupport.markedInProgress"));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResolve = async (req: any) => {
    if (!resolutionNote.trim()) {
      toast.error(t("staySupport.resolutionRequired"));
      return;
    }
    try {
      await updateStatus.mutateAsync({
        id: req.id,
        booking_id: req.booking_id,
        from_status: req.status,
        to_status: "resolved",
        resolution_note: resolutionNote.trim(),
      });
      toast.success(t("staySupport.markedResolved"));
      setResolvingId(null);
      setResolutionNote("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleOverride = async (req: any) => {
    if (!overrideReason.trim()) {
      toast.error(t("override.reasonRequired"));
      return;
    }
    try {
      await overrideStatus.mutateAsync({
        id: req.id,
        booking_id: req.booking_id,
        current_status: req.status,
        target_status: overrideTarget,
        reason: overrideReason.trim(),
        resolution_note: overrideTarget === "resolved" ? overrideResNote.trim() || undefined : undefined,
      });
      toast.success(t("override.applied"));
      setOverrideId(null);
      setOverrideTarget("");
      setOverrideReason("");
      setOverrideResNote("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Card id="maintenance-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          {t("staySupport.maintenanceQueue")}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setShowResolved(!showResolved)}>
          {showResolved ? t("staySupport.hideResolved") : t("staySupport.showResolved")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !requests?.length ? (
          <p className="text-sm text-muted-foreground">{t("staySupport.noRequests")}</p>
        ) : (
          <div className="space-y-3">
            {requests.map((req: any) => {
              const availableOverrideTargets = MAINTENANCE_STATUSES.filter((s) => s !== req.status);
              return (
                <div key={req.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{req.unit_name}</span>
                        <span className="text-xs text-muted-foreground">· {req.guest_name}</span>
                        <Badge variant="outline" className="text-xs">{t(`staySupport.categories.${req.category}`)}</Badge>
                        <Badge className={`text-xs ${STATUS_STYLES[req.status] ?? ""}`}>
                          {t(`staySupport.statuses.${req.status}`)}
                        </Badge>
                        {req.priority === "urgent" && (
                          <Badge variant="destructive" className="text-xs">{t("staySupport.urgent")}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">{req.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {canUpdateStatus && req.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => handleStart(req)} disabled={updateStatus.isPending}>
                          <Play className="h-3 w-3 mr-1" /> {t("staySupport.start")}
                        </Button>
                      )}
                      {canOverride && (
                        <Popover open={overrideId === req.id} onOpenChange={(open) => {
                          if (!open) { setOverrideId(null); setOverrideTarget(""); setOverrideReason(""); setOverrideResNote(""); }
                          else setOverrideId(req.id);
                        }}>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-muted-foreground">
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 space-y-3" align="end">
                            <p className="text-sm font-medium">{t("override.title")}</p>
                            <Select value={overrideTarget} onValueChange={setOverrideTarget}>
                              <SelectTrigger><SelectValue placeholder={t("override.selectStatus")} /></SelectTrigger>
                              <SelectContent>
                                {availableOverrideTargets.map((s) => (
                                  <SelectItem key={s} value={s}>{t(`staySupport.statuses.${s}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Textarea
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              placeholder={t("override.reasonPlaceholder")}
                              rows={2}
                            />
                            {overrideTarget === "resolved" && (
                              <Textarea
                                value={overrideResNote}
                                onChange={(e) => setOverrideResNote(e.target.value)}
                                placeholder={t("staySupport.resolutionPlaceholder")}
                                rows={2}
                              />
                            )}
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => handleOverride(req)}
                              disabled={!overrideTarget || !overrideReason.trim() || overrideStatus.isPending}
                            >
                              {t("override.confirm")}
                            </Button>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>

                  {canResolve && req.status === "in_progress" && resolvingId !== req.id && (
                    <Button size="sm" variant="outline" onClick={() => setResolvingId(req.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> {t("staySupport.resolve")}
                    </Button>
                  )}

                  {resolvingId === req.id && (
                    <div className="space-y-2 pt-1">
                      <Textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder={t("staySupport.resolutionPlaceholder")}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleResolve(req)} disabled={updateStatus.isPending}>
                          {t("staySupport.confirmResolve")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setResolvingId(null); setResolutionNote(""); }}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {req.status === "resolved" && req.resolution_note && (
                    <p className="text-xs text-muted-foreground italic">
                      {t("staySupport.resolution")}: {req.resolution_note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
