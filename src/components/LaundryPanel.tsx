import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllLaundryRequests, useAdvanceLaundryStatus, useOverrideLaundryStatus, getNextLaundryStatus } from "@/hooks/useLaundryRequests";
import { useAuth } from "@/hooks/useAuth";
import { useRolePreview } from "@/hooks/useRolePreview";
import { permissions } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Shirt, ArrowRight, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  received: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  ready_for_pickup: "bg-primary/10 text-primary border-primary/20",
  collected: "bg-green-100 text-green-800 border-green-200",
};

const LAUNDRY_STATUSES = ["received", "in_progress", "ready_for_pickup", "collected"];

export function LaundryPanel() {
  const { t } = useTranslation();
  const { role: actualRole } = useAuth();
  const { effectiveRole } = useRolePreview();
  const { data: requests, isLoading } = useAllLaundryRequests();
  const advanceStatus = useAdvanceLaundryStatus();
  const overrideStatus = useOverrideLaundryStatus();
  const canUpdate = permissions.canUpdateLaundryStatus(effectiveRole);
  const canOverride = permissions.canOverrideStaySupport(effectiveRole);

  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const handleAdvance = async (req: any) => {
    try {
      await advanceStatus.mutateAsync({
        id: req.id,
        booking_id: req.booking_id,
        current_status: req.status,
      });
      const next = getNextLaundryStatus(req.status);
      toast.success(t(`staySupport.statuses.${next}`));
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
      });
      toast.success(t("override.applied"));
      setOverrideId(null);
      setOverrideTarget("");
      setOverrideReason("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shirt className="h-5 w-5 text-muted-foreground" />
          {t("staySupport.laundryPanel")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !requests?.length ? (
          <p className="text-sm text-muted-foreground">{t("staySupport.noLaundryRequests")}</p>
        ) : (
          <div className="space-y-2">
            {requests.map((req: any) => {
              const nextStatus = getNextLaundryStatus(req.status);
              const availableOverrideTargets = LAUNDRY_STATUSES.filter((s) => s !== req.status);
              return (
                <div key={req.id} className="border rounded-md p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{req.guest_name}</span>
                        <span className="text-muted-foreground">· {req.unit_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(req.created_at), "MMM d, h:mm a")}</span>
                        {req.bag_count && <span>· {req.bag_count} {t("staySupport.bags")}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`text-xs ${STATUS_STYLES[req.status] ?? ""}`}>
                        {t(`staySupport.statuses.${req.status}`)}
                      </Badge>
                      {canUpdate && nextStatus && (
                        <Button size="sm" variant="outline" onClick={() => handleAdvance(req)} disabled={advanceStatus.isPending}>
                          <ArrowRight className="h-3 w-3 mr-1" />
                          {t(`staySupport.statuses.${nextStatus}`)}
                        </Button>
                      )}
                      {canOverride && (
                        <Popover open={overrideId === req.id} onOpenChange={(open) => {
                          if (!open) { setOverrideId(null); setOverrideTarget(""); setOverrideReason(""); }
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
