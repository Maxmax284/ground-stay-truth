import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HandMetal, X, MessageSquare, AlertTriangle } from "lucide-react";
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

interface InquiryQueueProps {
  bookings: any[] | undefined;
  isLoading: boolean;
}

export function InquiryQueue({ bookings, isLoading }: InquiryQueueProps) {
  const { t } = useTranslation();
  const transition = useTransitionBookingState();
  const qc = useQueryClient();
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const handleHold = async (bookingId: string) => {
    try {
      await transition.mutateAsync({
        bookingId,
        fromState: "inquiry",
        toState: "soft_hold",
        reason: "Inquiry acknowledged",
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("inquiry.held"));
    } catch {
      toast.error(t("inquiry.actionFailed"));
    }
  };

  const handleDismiss = async () => {
    if (!dismissId || !dismissReason.trim()) return;
    try {
      await transition.mutateAsync({
        bookingId: dismissId,
        fromState: "inquiry",
        toState: "cancelled",
        reason: dismissReason,
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(t("inquiry.dismissed"));
    } catch {
      toast.error(t("inquiry.actionFailed"));
    } finally {
      setDismissId(null);
      setDismissReason("");
    }
  };

  const count = bookings?.length ?? 0;

  return (
    <>
      <Card className={count > 0 ? "border-primary/50" : ""}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t("inquiry.queueTitle")}
            {count > 0 && (
              <Badge variant="default" className="ml-1 text-xs">
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
            <p className="text-sm text-muted-foreground">{t("inquiry.noItems")}</p>
          ) : (
            <div className="space-y-3">
              {bookings!.map((b: any) => {
                const waitTime = formatDistanceToNow(new Date(b.created_at), { addSuffix: true });
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
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
                          <AlertTriangle className="h-3 w-3" /> {t("inquiry.waiting")} {waitTime}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 px-3"
                        onClick={() => handleHold(b.id)}
                        disabled={transition.isPending}
                      >
                        <HandMetal className="h-3.5 w-3.5 mr-1" /> {t("inquiry.hold")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 px-3"
                        onClick={() => setDismissId(b.id)}
                        disabled={transition.isPending}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> {t("inquiry.dismiss")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dismissId} onOpenChange={(o) => !o && setDismissId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inquiry.dismissTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("inquiry.reasonPlaceholder")}
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDismissId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!dismissReason.trim() || transition.isPending}
              onClick={handleDismiss}
            >
              {t("inquiry.confirmDismiss")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
