import { SplitFlapText } from "@/components/SplitFlapText";
import { useSamuiConditions, describeWeather } from "@/hooks/useSamuiConditions";

/** Island barometer — one honest telex line from the weather feed. Read-only. */
function IslandBarometer() {
  const { data } = useSamuiConditions();
  if (!data || data.temperature === null) return null;
  const wet = (data.precipitation ?? 0) > 0 || (data.weatherCode ?? 0) >= 51;
  const rain = data.daily[0]?.rainChance;
  const parts = [
    `${Math.round(data.temperature)}°C`,
    describeWeather(data.weatherCode).label.toUpperCase(),
    rain != null ? `RAIN ${rain}%` : null,
    wet ? "CANVAS WET" : "CANVAS DRY",
  ].filter(Boolean);
  return (
    <span className="route-ticker-baro" title="Lamai conditions (Open-Meteo)">
      <span className={`baro-dot ${wet ? "baro-dot-wet" : ""}`} aria-hidden />
      {parts.join(" · ")}
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
      <IslandBarometer />
    </div>
  );
}
