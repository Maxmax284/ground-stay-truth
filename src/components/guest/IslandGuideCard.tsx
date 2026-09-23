import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ExternalLink, MapPin, Phone, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGuestLocalRecommendations,
  sortForArrival,
  type LocalRecommendation,
} from "@/hooks/useLocalRecommendations";

/**
 * The island guide, as written by Lamai.
 *
 * Everything here was typed by a manager and published by an admin — there is no
 * generated content and no scraped listing. If nothing is published, the card
 * doesn't render at all rather than filling the space with invented places.
 *
 * It's discovery, so it lives below the operational cards and opens on a tap.
 * On arrival day (`arrivalMode`) the places the team flagged as arrival
 * essentials come first — still discovery, never an instruction.
 */
export interface IslandGuideCardProps {
  /** Puts arrival essentials first and labels them. */
  arrivalMode?: boolean;
}

export function IslandGuideCard({ arrivalMode = false }: IslandGuideCardProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useGuestLocalRecommendations();

  const entries = useMemo(
    () => (arrivalMode ? sortForArrival(data ?? []) : (data ?? [])),
    [data, arrivalMode],
  );

  const essentials = useMemo(
    () => (arrivalMode ? entries.filter((r) => r.arrival_essential) : []),
    [entries, arrivalMode],
  );

  const grouped = useMemo(() => {
    const rest = arrivalMode ? entries.filter((r) => !r.arrival_essential) : entries;
    const map = new Map<string, LocalRecommendation[]>();
    for (const r of rest) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()];
  }, [entries, arrivalMode]);

  if (isLoading || !entries.length) return null;

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language || "en", { month: "short", year: "numeric" }).format(
      new Date(iso),
    );

  const Entry = ({ r }: { r: LocalRecommendation }) => (
    <div className="rounded-md border p-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{r.name}</p>
        {arrivalMode && r.arrival_essential && (
          <Badge className="gap-1 text-[10px]">
            <Star className="h-3 w-3" aria-hidden="true" />
            {t("localGuide.essential", "Good to know today")}
          </Badge>
        )}
        {r.closed_temporarily && (
          <Badge variant="secondary" className="text-[10px]">
            {t("localGuide.closed", "Temporarily closed")}
          </Badge>
        )}
        {r.badges?.map((b) => (
          <Badge key={b} variant="outline" className="text-[10px]">
            {b}
          </Badge>
        ))}
      </div>

      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
      {r.seasonal_note && <p className="text-xs italic text-muted-foreground">{r.seasonal_note}</p>}
      {r.distance_note && <p className="text-xs text-muted-foreground">{r.distance_note}</p>}
      {r.opening_hours && <p className="text-xs text-muted-foreground">{r.opening_hours}</p>}

      <div className="flex flex-wrap gap-3 pt-0.5">
        {r.maps_url && (
          <a
            href={r.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {t("localGuide.directions", "Directions")}
          </a>
        )}
        {r.phone && (
          <a
            href={`tel:${r.phone}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Phone className="h-3 w-3" aria-hidden="true" />
            {r.phone}
          </a>
        )}
        {r.website && (
          <a
            href={r.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {t("localGuide.website", "Website")}
          </a>
        )}
      </div>

      {r.last_reviewed_at && (
        <p className="text-[11px] text-muted-foreground">
          {t("localGuide.checked", "Checked {{date}}", { date: fmtDate(r.last_reviewed_at) })}
        </p>
      )}
    </div>
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-sm font-medium">
              {t("localGuide.title", "Around Lamai")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {arrivalMode && essentials.length > 0
                ? t("localGuide.arrivalSubtitle", "A few things worth knowing on your first day")
                : t("localGuide.subtitle", "Places the camp actually sends people to")}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="space-y-4">
            {essentials.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("localGuide.essentialsHeading", "First day")}
                </p>
                {essentials.map((r) => (
                  <Entry key={r.id} r={r} />
                ))}
              </div>
            )}

            {grouped.map(([category, list]) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`localGuide.categories.${category}`, category)}
                </p>
                {list.map((r) => (
                  <Entry key={r.id} r={r} />
                ))}
              </div>
            ))}

            <p className="text-[11px] text-muted-foreground">
              {t(
                "localGuide.disclaimer",
                "Written by the Lamai team. Hours and prices change — call ahead for anything that matters.",
              )}
            </p>
          </div>
        )}

        {!open && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
            {t("localGuide.open", "Have a look")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
