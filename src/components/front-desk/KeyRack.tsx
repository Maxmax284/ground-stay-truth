import { playGroundSound } from "@/lib/groundSounds";
/**
 * Brass Key Rack — read-only room board for Front Desk.
 * Every hook is derived from data already loaded; tapping a hook only opens
 * the booking sheet. Nothing here changes rooms, bookings or housekeeping.
 */
import { useMemo } from "react";
import { useUnits } from "@/hooks/useUnits";
import type { FrontDeskBooking, TodayTask } from "@/hooks/useFrontDesk";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { cn } from "@/lib/utils";

type HookState = "occupied" | "departing" | "arriving" | "turnover" | "vacant";

const LABEL: Record<HookState, string> = {
  occupied: "In house",
  departing: "Out today",
  arriving: "Due in",
  turnover: "Flip",
  vacant: "Free",
};

export function KeyRack({
  staying, departing, arriving, tasks, onOpen,
}: {
  staying: FrontDeskBooking[];
  departing: FrontDeskBooking[];
  arriving: FrontDeskBooking[];
  tasks: TodayTask[];
  onOpen: (bookingId: string) => void;
}) {
  const { data: units } = useUnits();

  const hooks = useMemo(() => {
    const list = (units ?? []).filter((u: any) => u.is_active !== false);
    return list
      .map((u: any) => {
        const dep = departing.find((b) => b.unit_id === u.id);
        const stay = staying.find((b) => b.unit_id === u.id);
        const arr = arriving.find((b) => b.unit_id === u.id);
        const task = tasks.find((t) => t.unit_id === u.id);
        let state: HookState = "vacant";
        let booking: FrontDeskBooking | undefined;
        if (dep) { state = "departing"; booking = dep; }
        else if (stay) { state = "occupied"; booking = stay; }
        else if (task) { state = "turnover"; booking = arr; }
        else if (arr) { state = "arriving"; booking = arr; }
        return { id: u.id as string, name: u.name as string, state, booking };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [units, staying, departing, arriving, tasks]);

  if (hooks.length === 0) return null;

  const counts = hooks.reduce<Record<HookState, number>>(
    (acc, h) => ({ ...acc, [h.state]: acc[h.state] + 1 }),
    { occupied: 0, departing: 0, arriving: 0, turnover: 0, vacant: 0 },
  );

  return (
    <section className="board-panel key-rack p-3 sm:p-4" aria-label="Key rack">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="board-kicker">Key rack</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {(Object.keys(LABEL) as HookState[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("key-dot", `key-${s}`)} /> {LABEL[s]} {counts[s]}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {hooks.map((h, i) => {
          const guest = h.booking ? resolveGuestDisplayName(h.booking as any) : null;
          return (
            <button
              key={h.id}
              type="button"
              disabled={!h.booking}
              onClick={() => { playGroundSound("brass_clack", 0.5); h.booking && onOpen(h.booking.id) }}
              title={guest ? `${h.name} · ${guest}` : `${h.name} · ${LABEL[h.state]}`}
              style={{ animationDelay: `${Math.min(i, 24) * 25}ms` }}
              className={cn("key-hook min-w-0", `key-${h.state}`)}
            >
              <span className="key-hook-hole" aria-hidden />
              <span className="block truncate text-[11px] font-semibold leading-tight">{h.name}</span>
              <span className="block truncate text-[9px] uppercase tracking-wider opacity-80">
                {LABEL[h.state]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
