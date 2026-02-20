import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/StarRating";
import { useSubmitReview } from "@/hooks/useReviews";
import { toast } from "sonner";

interface ReviewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestId: string;
  guestName: string | null;
}

export function ReviewFormDialog({ open, onOpenChange, bookingId, guestId, guestName }: ReviewFormDialogProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const submit = useSubmitReview();

  const handleSubmit = () => {
    if (rating === 0 || !title.trim() || !body.trim()) return;
    submit.mutate(
      {
        booking_id: bookingId,
        guest_id: guestId,
        rating,
        title: title.trim().slice(0, 100),
        body: body.trim().slice(0, 1000),
        guest_display_name: guestName,
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
            <p className="text-xs text-muted-foreground text-right">{body.length}/1000</p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || !title.trim() || !body.trim() || submit.isPending}
            className="w-full"
          >
            {submit.isPending ? t("common.saving") : t("reviews.submitReview")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
