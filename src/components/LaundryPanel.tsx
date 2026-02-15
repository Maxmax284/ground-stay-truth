import { useTranslation } from "react-i18next";
import { useAllLaundryRequests, useAdvanceLaundryStatus, getNextLaundryStatus } from "@/hooks/useLaundryRequests";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shirt, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  received: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  ready_for_pickup: "bg-primary/10 text-primary border-primary/20",
  collected: "bg-green-100 text-green-800 border-green-200",
};

export function LaundryPanel() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { data: requests, isLoading } = useAllLaundryRequests();
  const advanceStatus = useAdvanceLaundryStatus();
  const canUpdate = permissions.canUpdateLaundryStatus(role);

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
              return (
                <div key={req.id} className="flex items-center justify-between gap-3 border rounded-md p-3 text-sm">
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
