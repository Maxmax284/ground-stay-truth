import { useApprovedReviews } from "@/hooks/useReviews";
import { StarRating } from "@/components/StarRating";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { format } from "date-fns";
import { useMemo } from "react";

export function TestimonialSection() {
  const { data: reviews } = useApprovedReviews();

  const stats = useMemo(() => {
    if (!reviews?.length) return null;
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    return { avg: Math.round(avg * 10) / 10, count: reviews.length };
  }, [reviews]);

  if (!reviews?.length) return null;

  return (
    <section className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-serif text-2xl font-bold text-foreground">What Our Guests Say</h2>
        {stats && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-foreground">{stats.avg}</span>
            <span>({stats.count} {stats.count === 1 ? "review" : "reviews"})</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reviews.map((r) => (
          <Card key={r.id} className="hover-lift">
            <CardContent className="pt-5 space-y-2">
              <StarRating rating={r.rating} size="sm" />
              <p className="font-semibold text-sm text-foreground">{r.title}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{r.body}</p>
              <p className="text-xs text-muted-foreground pt-1">
                {r.guest_display_name ?? "Guest"} · {format(new Date(r.created_at), "MMM yyyy")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
