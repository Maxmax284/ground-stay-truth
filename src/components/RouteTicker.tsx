import { SplitFlapText } from "@/components/SplitFlapText";

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
    </div>
  );
}
