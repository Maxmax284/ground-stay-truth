import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ExternalLink, Plane } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveAirportGuidance, isGuidanceStale } from "@/lib/airportGuidance";

/**
 * Airport orientation for the leg the guest is on.
 *
 * Deliberately modest: one orientation line, the airport's own official links,
 * and the date a human last checked the entry. No gates, no counters, no
 * walking directions, no visa advice — for anything that moves, we send people
 * to the airport's own map. Airports we haven't checked say so.
 *
 * This card is discovery, not instruction: it always sits below the Now card.
 */
interface Props {
  /** IATA code for the current leg, e.g. "BKK". */
  airportCode?: string | null;
  /** Short label for which leg this is, already translated. */
  legLabel?: string | null;
}

export function AirportGuidanceCard({ airportCode, legLabel }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const result = resolveAirportGuidance(airportCode);

  if (!result) return null;

  if (result.kind === "unknown") {
    return (
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-sm font-medium flex items-center gap-2">
            <Plane className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {result.code}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(
              "airportGuidance.noCoverage",
              "We don't have checked guidance for this airport yet. Follow the airport's own signage, and message us if you need a hand.",
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const a = result.airport;
  const stale = isGuidanceStale(a);
  const reviewed = new Intl.DateTimeFormat(i18n.language || "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${a.lastReviewed}T00:00:00Z`));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 text-left"
        >
          <Plane className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-sm font-medium">
              {a.name} ({a.code})
            </span>
            <span className="block text-xs text-muted-foreground">
              {legLabel ? `${legLabel} · ` : ""}
              {a.city}, {a.country}
            </span>
          </span>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{a.orientation}</p>

            {a.terminals && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("airportGuidance.terminals", "Terminals")}:{" "}
                </span>
                {a.terminals}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {t(
                "airportGuidance.mapNote",
                "Gates, counters and shops change — always check the airport's own map on the day.",
              )}
            </p>

            <ul className="space-y-1">
              {a.links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            <p className="text-[11px] text-muted-foreground">
              {t("airportGuidance.lastReviewed", "Last checked {{date}}", { date: reviewed })}
              {stale ? ` · ${t("airportGuidance.stale", "may be out of date")}` : ""}
            </p>
          </div>
        )}

        {!open && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
            {t("airportGuidance.open", "Airport orientation")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
