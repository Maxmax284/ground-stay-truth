import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/StarRating";
import { useSubmitReview, getReviewTimeGate } from "@/hooks/useReviews";
import { toast } from "sonner";
import { format } from "date-fns";
import { Clock, AlertTriangle } from "lucide-react";

interface ReviewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestId: string;
  guestName: string | null;
  checkOut?: string;
  checkIn?: string;
  unitName?: string;
  stayNights?: number;
}

export function ReviewFormDialog({ open, onOpenChange, bookingId, guestId, guestName, checkOut, checkIn, unitName, stayNights }: ReviewFormDialogProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const submit = useSubmitReview();

  // Time-gate check
  const timeGate = useMemo(() => {
    if (!checkOut) return { canReview: true };
    return getReviewTimeGate(checkOut);
  }, [checkOut]);

  const titleTooShort = title.trim().length > 0 && title.trim().length < 10;
  const bodyTooShort = body.trim().length > 0 && body.trim().length < 20;

  const handleSubmit = () => {
    if (rating === 0 || title.trim().length < 10 || body.trim().length < 20) return;
    submit.mutate(
      {
        booking_id: bookingId,
        guest_id: guestId,
        rating,
        title: title.trim().slice(0, 100),
        body: body.trim().slice(0, 1000),
        guest_display_name: guestName,
        stay_check_in: checkIn,
        stay_check_out: checkOut,
        stay_unit_name: unitName,
        stay_nights: stayNights,
      },
      {
        onSuccess: () => {
          toast.success(t("reviews.submitReview"));
          onOpenChange(false);
          setRating(0);
          setTitle("");
          setBody("");
        },
        onError: (err: any) => toast.error(err.message),
      },
    );
  };

  // Show time-gate message if can't review
  if (!timeGate.canReview) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reviews.leaveReview")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            {timeGate.reason === "too_early" ? (
              <>
                <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm text-foreground">{t("reviews.tooEarly")}</p>
                  {timeGate.reviewStartDate && (
                    <p className="text-xs text-muted-foreground">
                      {t("reviews.canReviewFrom", { date: format(timeGate.reviewStartDate, "MMM d, yyyy 'at' h:mm a") })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{t("reviews.windowClosed")}</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reviews.leaveReview")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("reviews.rating")}</Label>
            <StarRating rating={rating} interactive onChange={setRating} size="lg" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("reviews.title")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder={t("reviews.titlePlaceholder")}
            />
            {titleTooShort && (
              <p className="text-xs text-destructive">{t("reviews.titleMinLength")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("reviews.body")}</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={t("reviews.bodyPlaceholder")}
            />
            <div className="flex justify-between">
              {bodyTooShort && (
                <p className="text-xs text-destructive">{t("reviews.bodyMinLength")}</p>
              )}
              <p className="text-xs text-muted-foreground text-right ml-auto">{body.length}/1000</p>
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || title.trim().length < 10 || body.trim().length < 20 || submit.isPending}
            className="w-full"
          >
            {submit.isPending ? t("common.saving") : t("reviews.submitReview")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
