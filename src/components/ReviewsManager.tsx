import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StarRating } from "@/components/StarRating";
import { useAllReviews, useApproveReview, useRejectReview, useDeleteReview, useReviewAuditLog, type Review } from "@/hooks/useReviews";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle, XCircle, Trash2, Star, ChevronDown, ChevronUp, CalendarDays, Home, History } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ReviewsManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const { data: reviews, isLoading } = useAllReviews(filter);
  const approve = useApproveReview();
  const reject = useRejectReview();
  const remove = useDeleteReview();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!reviews) return { avg: 0, total: 0, pending: 0 };
    const approved = reviews.filter((r) => r.status === "approved");
    const avg = approved.length > 0 ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0;
    const pending = reviews.filter((r) => r.status === "pending").length;
    return { avg: Math.round(avg * 10) / 10, total: approved.length, pending };
  }, [reviews]);

  const getReviewSnapshot = (r: Review) => ({
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    guest_display_name: r.guest_display_name,
  });

  const handleApprove = (r: Review) => {
    approve.mutate(
      { id: r.id, reviewedBy: user!.id, reviewSnapshot: getReviewSnapshot(r) },
      {
        onSuccess: () => toast.success(t("reviews.approved")),
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  const handleReject = () => {
    if (!rejectId || !rejectNote.trim()) return;
    const review = reviews?.find((r) => r.id === rejectId);
    reject.mutate(
      {
        id: rejectId,
        reviewedBy: user!.id,
        adminNote: rejectNote.trim(),
        reviewSnapshot: review ? getReviewSnapshot(review) : undefined,
      },
      {
        onSuccess: () => { toast.success(t("reviews.rejected")); setRejectId(null); setRejectNote(""); },
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  const handleDelete = (r: Review) => {
    remove.mutate(
      { id: r.id, performedBy: user!.id, reviewSnapshot: getReviewSnapshot(r) },
      {
        onSuccess: () => toast.success(t("reviews.removed")),
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  const STATUS_BADGE: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-xl font-bold">{stats.avg || "—"}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("reviews.overallRating")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <span className="text-xl font-bold">{stats.total}</span>
            <p className="text-xs text-muted-foreground">{t("reviews.approved")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <span className="text-xl font-bold">{stats.pending}</span>
            <p className="text-xs text-muted-foreground">{t("reviews.pending")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">{t("reviews.all")}</TabsTrigger>
          <TabsTrigger value="pending">{t("reviews.pending")}{stats.pending > 0 && ` (${stats.pending})`}</TabsTrigger>
          <TabsTrigger value="approved">{t("reviews.approved")}</TabsTrigger>
          <TabsTrigger value="rejected">{t("reviews.rejected")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Reviews List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : !reviews?.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t("reviews.noReviews")}</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StarRating rating={r.rating} size="sm" />
                      <Badge className={STATUS_BADGE[r.status] ?? ""}>{t(`reviews.${r.status}`)}</Badge>
                    </div>
                    <p className="font-semibold text-sm text-foreground">{r.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-3">{r.body}</p>

                    {/* Booking metadata */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{r.guest_display_name ?? t("common.unknown")}</span>
                      <span>·</span>
                      <span>{format(new Date(r.created_at), "MMM d, yyyy")}</span>
                      {r.stay_unit_name && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Home className="h-3 w-3" />{r.stay_unit_name}</span>
                        </>
                      )}
                      {r.stay_check_in && r.stay_check_out && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {format(new Date(r.stay_check_in), "MMM d")} – {format(new Date(r.stay_check_out), "MMM d, yyyy")}
                          </span>
                        </>
                      )}
                      {r.stay_nights && (
                        <>
                          <span>·</span>
                          <span>{r.stay_nights} {t("common.nights")}</span>
                        </>
                      )}
                    </div>

                    {r.admin_note && (
                      <p className="text-xs text-destructive italic mt-1">{t("reviews.adminNote")}: {r.admin_note}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {r.status === "pending" && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => handleApprove(r)} disabled={approve.isPending}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { setRejectId(r.id); setRejectNote(""); }} disabled={reject.isPending}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("reviews.remove")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("reviews.removeConfirm")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(r)} className="bg-destructive text-destructive-foreground">
                            {t("common.delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Audit Trail Toggle */}
                <button
                  onClick={() => setExpandedAudit(expandedAudit === r.id ? null : r.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <History className="h-3 w-3" />
                  {t("reviews.moderationHistory")}
                  {expandedAudit === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {expandedAudit === r.id && <AuditTrail reviewId={r.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Dialog — reason is now mandatory */}
      <AlertDialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reviews.reject")}</AlertDialogTitle>
            <AlertDialogDescription>{t("reviews.rejectReasonRequired")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={t("reviews.adminNotePlaceholder")} />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={!rejectNote.trim()} className="bg-destructive text-destructive-foreground">
              {t("reviews.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Inline audit trail for a review */
function AuditTrail({ reviewId }: { reviewId: string }) {
  const { t } = useTranslation();
  const { data: logs, isLoading } = useReviewAuditLog(reviewId);

  if (isLoading) return <p className="text-xs text-muted-foreground pl-4">{t("common.loading")}</p>;
  if (!logs?.length) return <p className="text-xs text-muted-foreground pl-4">{t("reviews.noAuditHistory")}</p>;

  return (
    <div className="pl-4 border-l-2 border-muted space-y-2 mt-1">
      {logs.map((log) => (
        <div key={log.id} className="text-xs space-y-0.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{log.action}</Badge>
            <span className="text-muted-foreground">{format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
          </div>
          {log.reason && <p className="text-muted-foreground italic">{log.reason}</p>}
        </div>
      ))}
    </div>
  );
}
