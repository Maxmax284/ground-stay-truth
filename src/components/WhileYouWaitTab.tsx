import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useSamuiConditions, describeWeather, describeSurf } from "@/hooks/useSamuiConditions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Thermometer, Waves, Wind, RefreshCcw, ArrowUp, ArrowDown, ShieldCheck, Droplets,
} from "lucide-react";

const FALLBACK_RULES = [
  "Shoes off before you step inside — rooms and the gym floor both.",
  "No shoes, no shirt, no ring — wraps and gloves stay in your bag until class.",
  "Quiet hours 22:00–07:00. People here train at 7am.",
  "Rinse the sand and salt off before you get in the pool or your bed.",
  "Bin your wraps, not your tape — the drains here hate tape.",
  "Motorbike? Helmet on. Police checkpoints on the ring road are constant.",
];

/**
 * "While You Wait" — live Lamai conditions plus the camp basics, built for a
 * guest killing time at a departure gate on bad hotel WiFi. Read-only, no writes.
 */
export function WhileYouWaitTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useSamuiConditions();

  const { data: rules } = useQuery({
    queryKey: ["camp-rules-summary"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "house_rules_summary")
        .maybeSingle();
      const raw = data?.value ? String(data.value).replace(/^"|"$/g, "") : "";
      const lines = raw
        .split(/\r?\n|•/)
        .map((l) => l.trim())
        .filter(Boolean);
      return lines.length ? lines : null;
    },
  });

  const weather = describeWeather(data?.weatherCode ?? null);
  const surf = describeSurf(data?.waveHeight ?? null);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("whileYouWait.title", "While you wait")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("whileYouWait.subtitle", "Live Lamai Beach conditions and the camp basics. Read it at the gate.")}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          {t("common.refresh", "Refresh")}
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t("whileYouWait.failed", "The live weather and sea feed isn't answering right now. The camp basics below are still good.")}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Weather now */}
          <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Thermometer className="h-3.5 w-3.5 text-primary" />
                {t("whileYouWait.onIsland", "On the island right now")}
              </div>
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold text-foreground">
                  {data.temperature !== null ? `${Math.round(data.temperature)}°` : "—"}
                </span>
                <div className="pb-1">
                  <p className="text-sm font-medium text-foreground">
                    {weather.emoji} {weather.label}
                  </p>
                  {data.feelsLike !== null && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("whileYouWait.feelsLike", "Feels like")} {Math.round(data.feelsLike)}°
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {data.windKph !== null && (
                  <span className="flex items-center gap-1">
                    <Wind className="h-3 w-3" /> {Math.round(data.windKph)} km/h
                  </span>
                )}
                {data.precipitation !== null && (
                  <span className="flex items-center gap-1">
                    <Droplets className="h-3 w-3" /> {data.precipitation} mm
                  </span>
                )}
              </div>

              {data.daily.length > 0 && (
                <div className="flex gap-2 pt-1">
                  {data.daily.map((d) => {
                    const w = describeWeather(d.code);
                    return (
                      <div key={d.date} className="flex-1 rounded-md border border-border px-2 py-1.5 text-center">
                        <p className="text-[10px] uppercase text-muted-foreground">
                          {format(new Date(d.date), "EEE")}
                        </p>
                        <p className="text-sm leading-tight">{w.emoji}</p>
                        <p className="text-[11px] font-medium text-foreground">
                          {d.max !== null ? Math.round(d.max) : "—"}°
                        </p>
                        {d.rainChance !== null && (
                          <p className="text-[10px] text-muted-foreground">{d.rainChance}%</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sea, surf, tide */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Waves className="h-3.5 w-3.5 text-primary" />
                {t("whileYouWait.seaState", "Sea state — Lamai Beach")}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{surf.label}</p>
                <p className="text-xs text-muted-foreground">{surf.note}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {data.waveHeight !== null && (
                  <span>{t("whileYouWait.waveHeight", "Wave height")} {data.waveHeight.toFixed(2)} m</span>
                )}
                {data.wavePeriod !== null && (
                  <span>{t("whileYouWait.period", "Period")} {Math.round(data.wavePeriod)} s</span>
                )}
              </div>

              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-medium text-foreground">
                  {t("whileYouWait.nextTides", "Next tides")}
                </p>
                {data.tides.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("whileYouWait.noTides", "Tide readings aren't available right now.")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {data.tides.map((tide) => (
                      <div key={tide.time} className="flex items-center gap-2 text-[11px]">
                        {tide.type === "high" ? (
                          <ArrowUp className="h-3 w-3 text-primary" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="font-medium text-foreground">
                          {tide.type === "high"
                            ? t("whileYouWait.highTide", "High")
                            : t("whileYouWait.lowTide", "Low")}
                        </span>
                        <span className="text-muted-foreground">
                          {format(new Date(tide.time), "EEE HH:mm")}
                        </span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          {tide.height.toFixed(2)} m
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Camp basics */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {t("whileYouWait.campRules", "Camp basics")}
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
            {(rules ?? FALLBACK_RULES).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        {t("whileYouWait.source", "Weather and sea data from Open-Meteo. Times shown in Samui local time.")}
      </p>
    </div>
  );
}
