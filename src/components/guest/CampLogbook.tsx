/**
 * Camp Logbook — keepsake stamp card for the guest portal.
 * Purely presentational: each stamp only reflects facts already on the booking.
 * It never changes booking, travel or immigration state.
 */
import { cn } from "@/lib/utils";

type Stamp = { key: string; label: string; sub: string; inked: boolean; shape: "rect" | "round" | "box" | "seal" };

export function CampLogbook({ booking, completed }: { booking: any | null; completed: boolean }) {
  if (!booking) return null;
  const d = (booking.arrival_details ?? {}) as Record<string, any>;
  const state = booking.state as string;
  const stamps: Stamp[] = [
    { key: "radar", label: "Radar acquired", sub: "Travel locked in", shape: "rect",
      inked: !!(d.flight_number || d.arrival_type || d.confirmed_airport) },
    { key: "gate", label: "Ring gate entered", sub: "Arrived at camp", shape: "round",
      inked: ["checked_in", "completed"].includes(state) },
    { key: "customs", label: "Immigration cleared", sub: "TM30 filed", shape: "box",
      inked: !!d.tm30?.confirmed_at },
    { key: "veteran", label: "Camp veteran", sub: "Full slate", shape: "seal",
      inked: completed || state === "completed" },
  ];
  const count = stamps.filter((s) => s.inked).length;
  return (
    <section className="camp-logbook" aria-label="Camp logbook">
      <div className="flex items-baseline justify-between mb-3">
        <span className="board-kicker">Camp logbook</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{count}/4 inked</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stamps.map((s, i) => (
          <div key={s.key} className="logbook-slot">
            {s.inked ? (
              <span
                className={cn("logbook-stamp", `logbook-${s.shape}`)}
                style={{ transform: `rotate(${[-6, 4, -3, 7][i]}deg)`, animationDelay: `${i * 90}ms` }}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider leading-tight">{s.label}</span>
                <span className="block text-[8px] uppercase tracking-widest opacity-80">{s.sub}</span>
              </span>
            ) : (
              <span className="logbook-empty">
                <span className="block text-[9px] uppercase tracking-wider">{s.label}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
