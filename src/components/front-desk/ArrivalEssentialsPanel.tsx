import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, MapPin, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllLocalRecommendations,
  useToggleArrivalEssential,
  sortForArrival,
  needsReview,
  daysSinceReview,
} from "@/hooks/useLocalRecommendations";

/**
 * The island guide, on the Arrivals Board.
 *
 * Front desk can see what Nikki has written; managers and admins can flag a
 * place as essential for someone landing today, which pushes it to the top of
 * the guest's guide. Purely editorial — flagging changes nothing about a
 * booking, pickup or flight.
 *
 * Unpublished entries are shown to staff as drafts so nobody flags something a
 * guest can't actually see yet.
 */
export function ArrivalEssentialsPanel() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const canFlag = role === "admin" || role === "manager";
  const { data, isLoading } = useAllLocalRecommendations();
  const toggle = useToggleArrivalEssential();

  const entries = useMemo(() => sortForArrival(data ?? []), [data]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {t(
            "arrivalsBoard.guideEmpty",
            "No places written yet. Add them under Settings → Guide and guests will see them here.",
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {canFlag
          ? t(
              "arrivalsBoard.guideHintManager",
              "Flag a place as a first-day essential and arriving guests see it at the top of their guide.",
            )
          : t(
              "arrivalsBoard.guideHintStaff",
              "What the camp recommends. Managers decide which places arriving guests see first.",
            )}
      </p>

      {entries.map((r) => {
        const published = r.featured && r.is_active;
        const stale = needsReview(r);
        const since = daysSinceReview(r);
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">{r.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {r.category}
            </Badge>
            {published ? (
              r.arrival_essential && (
                <Badge className="gap-1 text-[10px]">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  {t("arrivalsBoard.guideEssential", "First day")}
                </Badge>
              )
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                {t("arrivalsBoard.guideDraft", "Not published")}
              </Badge>
            )}
            {r.closed_temporarily && (
              <Badge variant="secondary" className="text-[10px]">
                {t("localGuide.closed", "Temporarily closed")}
              </Badge>
            )}
            {stale && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {since === null
                  ? t("arrivalsBoard.guideNeverChecked", "never checked")
                  : t("arrivalsBoard.guideCheckedAgo", "checked {{days}}d ago", { days: since })}
              </span>
            )}

            {canFlag && (
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {t("arrivalsBoard.guideFlag", "First-day essential")}
                <Switch
                  checked={r.arrival_essential}
                  disabled={toggle.isPending}
                  aria-label={`${t("arrivalsBoard.guideFlag", "First-day essential")}: ${r.name}`}
                  onCheckedChange={(v) =>
                    toggle.mutate(
                      { id: r.id, essential: v },
                      {
                        onError: (err: any) =>
                          toast.error(err?.message ?? t("common.error", "Something went wrong")),
                      },
                    )
                  }
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
