import { useEffect, useState } from "react";
import { SplitFlapText } from "@/components/SplitFlapText";
import { useSamuiConditions, describeWeather } from "@/hooks/useSamuiConditions";
import { useAirportTraffic } from "@/hooks/useAirportTraffic";

/** Island barometer — one honest telex line from the weather feed. Read-only. */
function IslandBarometer() {
  const { data } = useSamuiConditions();
  const { data: traffic } = useAirportTraffic("USM");
  if (!data || data.temperature === null) return null;
  const arrivals = (traffic ?? []).filter((f) => f.direction === "arrival");
  const late = arrivals.filter((f) => (f.delay_minutes ?? 0) >= 30).length;
  const down = arrivals.filter((f) => f.flight_status === "landed").length;
  const radar = traffic
    ? arrivals.length
      ? `USM ${down}/${arrivals.length} DOWN${late ? ` · ${late} LATE` : ""}`
      : "USM RADAR QUIET"
    : "USM RADAR STANDBY";
  // Sea state from marine feed — a read on crossing conditions, not an official ferry status.
  const sea = data.waveHeight != null ? `SEA ${data.waveHeight.toFixed(1)}M${data.waveHeight >= 1.5 ? " ROUGH" : ""}` : null;
  const wet = (data.precipitation ?? 0) > 0 || (data.weatherCode ?? 0) >= 51;
  const rain = data.daily[0]?.rainChance;
  const parts = [
    `${Math.round(data.temperature)}°C`,
    describeWeather(data.weatherCode).label.toUpperCase(),
    rain != null ? `RAIN ${rain}%` : null,
    wet ? "CANVAS WET" : "CANVAS DRY",
    radar,
    sea,
  ].filter(Boolean);
  // Monsoon Shutter — a reminder of the physical routine, never an action.
  const code = data.weatherCode ?? 0;
  const squall = (data.windKph ?? 0) >= 35 || [63, 65, 81, 82, 95, 96, 99].includes(code) || (data.precipitation ?? 0) >= 4;
  return (
    <span className="route-ticker-baro" title="Lamai weather + sea (Open-Meteo) · USM arrivals radar. Sea state is not an official ferry schedule.">
      <span className={`baro-dot ${wet ? "baro-dot-wet" : ""}`} aria-hidden />
      {squall && <span className="route-ticker-squall">[ GULF SQUALL · DROP RING TARPS · STOW OUTDOOR RACKS ] </span>}
      {parts.join(" · ")}
    </span>
  );
}

/** Camp Rhythm Clock — where the camp is in its day (Bangkok time). Display only. */
function campRhythm(now: Date) {
  const hm = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(":", ""));
  if (hm >= 700 && hm < 900) return { live: true, text: "MORNING SESSION · RUN & PADS" };
  if (hm >= 900 && hm < 1630) return { live: false, text: "CAMP REST · RECOVERY & INTAKE" };
  if (hm >= 1630 && hm < 1830) return { live: true, text: "AFTERNOON SESSION · CLINCH & SPARRING" };
  return { live: false, text: "NIGHT RECOVERY · CAMP QUIET" };
}

function CampRhythm() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const r = campRhythm(now);
  return (
    <span className="route-ticker-rhythm" title="Camp day rhythm (Bangkok time)">
      <span className={`baro-dot ${r.live ? "rhythm-dot-live" : ""}`} aria-hidden />
      {r.text}
    </span>
  );
}

/** Slim sub-labels for known routes (transit-board flavour). */
const routeSubs: Record<string, string> = {
  "/": "GROUND OPS",
  "/dashboard": "GROUND OPS",
  "/front-desk": "COUNTER",
  "/bookings": "MANIFEST",
  "/bookings/history": "LEDGER",
  "/calendar": "THE GRID",
  "/units": "24 BAYS",
  "/pricing": "RATE CARD",
  "/reports": "THE BOOKS",
  "/messages": "WIRE",
  "/notifications": "KNOCKS",
  "/settings": "CAMP CONFIG",
  "/ops-console": "WAR ROOM",
  "/ops-control-tower": "WAR ROOM",
  "/guest-preview": "LOOK-ONLY",
};

/**
 * Solari Route Flip — slim transit ticker under the staff header.
 * Letters clatter into the new route on every navigation; a gold pulse
 * sweeps the strip once per change. Static (plain text) for reduced motion.
 */
export function RouteTicker({ path, title }: { path: string; title: string }) {
  const sub = routeSubs[path];
  const label = `ROUTE // ${title.toUpperCase()}`;
  return (
    <div className="route-ticker" role="status" aria-label={label}>
      <span key={path} className="route-ticker-sweep" aria-hidden />
      <span className="route-ticker-label">
        <SplitFlapText key={path} text={label} />
      </span>
      {sub && (
        <span className="route-ticker-sub" aria-hidden>
          · {sub}
        </span>
      )}
      <CampRhythm />
      <IslandBarometer />
    </div>
  );
}
