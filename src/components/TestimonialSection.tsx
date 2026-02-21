import { useApprovedReviews, maskDisplayName, type Review } from "@/hooks/useReviews";
import { StarRating } from "@/components/StarRating";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useMemo } from "react";

/** Rating distribution bar */
function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right text-muted-foreground">{star}</span>
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function TestimonialSection() {
  const { data: reviews } = useApprovedReviews();

  const stats = useMemo(() => {
    if (!reviews?.length) return null;
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const dist = [0, 0, 0, 0, 0];
    reviews.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++; });
    return { avg: Math.round(avg * 10) / 10, count: reviews.length, dist };
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

      {/* Rating Distribution */}
      {stats && stats.count >= 3 && (
        <div className="max-w-xs mx-auto space-y-1">
          {[5, 4, 3, 2, 1].map((star) => (
            <RatingBar key={star} star={star} count={stats.dist[star - 1]} total={stats.count} />
          ))}
        </div>
      )}

      {/* Review Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reviews.map((r) => (
          <Card key={r.id} className="hover-lift">
            <CardContent className="pt-5 space-y-2">
              <div className="flex items-center justify-between">
                <StarRating rating={r.rating} size="sm" />
                <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Verified Stay
                </Badge>
              </div>
              <p className="font-semibold text-sm text-foreground">{r.title}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{r.body}</p>
              <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
                <p>
                  {maskDisplayName(r.guest_display_name)}
                  {r.stay_check_in && ` · Stayed in ${format(new Date(r.stay_check_in), "MMM yyyy")}`}
                </p>
                {r.stay_nights && r.stay_nights > 0 && (
                  <p className="text-muted-foreground/60">{r.stay_nights} night{r.stay_nights !== 1 ? "s" : ""}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Compliance Disclosure */}
      <p className="text-center text-[11px] text-muted-foreground/60">
        All reviews are from verified guests and moderated by management.
      </p>
    </section>
  );
}
