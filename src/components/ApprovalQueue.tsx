import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Clock, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface ApprovalQueueProps {
  bookings: any[] | undefined;
  isLoading: boolean;
}

export function ApprovalQueue({ bookings, isLoading }: ApprovalQueueProps) {
  const { t } = useTranslation();
  const transition = useTransitionBookingState();
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async (bookingId: string) => {
    try {
      await transition.mutateAsync({
        bookingId,
        fromState: "pending_approval",
        toState: "pending_deposit",
        reason: "Booking approved",
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("approval.approved"));
    } catch {
      toast.error(t("approval.actionFailed"));
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await transition.mutateAsync({
        bookingId: rejectId,
        fromState: "pending_approval",
        toState: "cancelled",
        reason: rejectReason,
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("approval.rejected"));
    } catch {
      toast.error(t("approval.actionFailed"));
    } finally {
      setRejectId(null);
      setRejectReason("");
    }
  };

  const count = bookings?.length ?? 0;

  return (
    <>
      <Card className={count > 0 ? "border-warning/50" : ""}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            {t("approval.queueTitle")}
            {count > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">
                {count}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : count === 0 ? (
            <p className="text-sm text-muted-foreground">{t("approval.noItems")}</p>
          ) : (
            <div className="space-y-3">
              {bookings!.map((b: any) => {
                const waitTime = formatDistanceToNow(new Date(b.created_at), { addSuffix: true });
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {b.units?.name ?? "—"}
                        </span>
                        {b.profiles?.full_name && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {b.profiles.full_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>
                          {format(new Date(b.check_in), "MMM d")} – {format(new Date(b.check_out), "MMM d")}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> {t("approval.waiting")} {waitTime}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 px-3"
                        onClick={() => handleApprove(b.id)}
                        disabled={transition.isPending}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> {t("approval.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 px-3"
                        onClick={() => setRejectId(b.id)}
                        disabled={transition.isPending}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> {t("approval.reject")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approval.rejectTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("approval.reasonPlaceholder")}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || transition.isPending}
              onClick={handleReject}
            >
              {t("approval.confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
