import { Plane, PlaneLanding, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type RadarLeg = "inbound" | "transit" | "island" | "arrived";

interface Props {
  /** First flight into Thailand, e.g. EK384 */
  intlFlight?: string | null;
  /** Final hop onto Samui, e.g. PG5125 */
  finalFlight?: string | null;
  /** Which leg is live right now */
  leg: RadarLeg;
  statusLabel: string;
  etaLabel?: string | null;
  delayMinutes?: number | null;
  gate?: string | null;
  terminal?: string | null;
  altitudeLabel?: string | null;
  transitLine: string;
}

/**
 * Ground Radar — the guest-facing flight panel. Dark, tight, military-minimalist:
 * a hop line for the route, a sweeping radar for the live leg, and one blatant
 * line telling the guest what to actually do when they touch down.
 * Pure presentation — all data is handed in.
 */
export function GroundRadar({
  intlFlight,
  finalFlight,
  leg,
  statusLabel,
  etaLabel,
  delayMinutes,
  gate,
  terminal,
  altitudeLabel,
  transitLine,
}: Props) {
  const hops = [
    { key: "origin", label: "Origin", code: intlFlight ? intlFlight : "—" },
    ...(intlFlight ? [{ key: "transit", label: "Transit", code: "BKK / DMK" }] : []),
    { key: "island", label: "Koh Samui", code: finalFlight ?? "USM" },
  ];

  const activeIndex =
    leg === "inbound" ? 0 : leg === "transit" ? (intlFlight ? 1 : 0) : hops.length - 1;
  const arrived = leg === "arrived";

  return (
    <div className="rounded-lg bg-sidebar text-sidebar-foreground p-4 space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-sidebar-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/70">
            Ground Radar
          </span>
        </div>
        <Badge className="bg-sidebar-accent text-sidebar-accent-foreground border-0 text-[10px] font-mono uppercase tracking-wider">
          {statusLabel}
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        {/* Radar scope */}
        <div className="relative h-24 w-24 shrink-0">
          <div className="absolute inset-0 rounded-full border border-sidebar-border" />
          <div className="absolute inset-[18%] rounded-full border border-sidebar-border/70" />
          <div className="absolute inset-[38%] rounded-full border border-sidebar-border/50" />
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-sidebar-border/50" />
          <div className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-sidebar-border/50" />
          {!arrived && (
            <div
              className="radar-sweep absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, hsl(var(--sidebar-primary) / 0.45) 0deg, transparent 55deg, transparent 360deg)",
              }}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="relative flex h-3 w-3 items-center justify-center">
              {!arrived && (
                <span className="radar-ping absolute h-3 w-3 rounded-full bg-sidebar-primary/60" />
              )}
              <span className="relative h-2 w-2 rounded-full bg-sidebar-primary" />
            </span>
          </div>
        </div>

        {/* Live readout */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-semibold tracking-tight">
              {finalFlight ?? intlFlight ?? "—"}
            </span>
            {arrived ? (
              <PlaneLanding className="h-4 w-4 text-sidebar-primary" />
            ) : (
              <Plane className="h-4 w-4 text-sidebar-foreground/60" />
            )}
          </div>
          {etaLabel && (
            <p className="text-xs text-sidebar-foreground/80">
              <span className="text-sidebar-foreground/50 uppercase text-[10px] tracking-wider mr-1">ETA</span>
              {etaLabel}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
            {!!delayMinutes && delayMinutes > 0 && (
              <span className="text-sidebar-primary">+{delayMinutes}m late</span>
            )}
            {terminal && <span>Term {terminal}</span>}
            {gate && <span>Gate {gate}</span>}
            {altitudeLabel && <span>{altitudeLabel}</span>}
          </div>
        </div>
      </div>

      {/* Hop line */}
      <div className="flex items-center">
        {hops.map((hop, i) => (
          <div key={hop.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  i <= activeIndex ? "bg-sidebar-primary" : "bg-sidebar-border"
                }`}
              />
              <span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/60 whitespace-nowrap">
                {hop.label}
              </span>
              <span className="font-mono text-[10px] text-sidebar-foreground/85 whitespace-nowrap">
                {hop.code}
              </span>
            </div>
            {i < hops.length - 1 && (
              <div className="mx-1 flex-1 self-start mt-[4px]">
                <div
                  className={`h-[2px] w-full ${
                    i === activeIndex && !arrived
                      ? "radar-leg-active"
                      : i < activeIndex
                        ? "bg-sidebar-primary"
                        : "bg-sidebar-border"
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Blatant transit guidance — the whole point of the panel */}
      <div className="rounded-md border border-sidebar-border bg-sidebar-accent/60 px-3 py-2">
        <p className="text-xs leading-snug text-sidebar-accent-foreground">{transitLine}</p>
      </div>
    </div>
  );
}
