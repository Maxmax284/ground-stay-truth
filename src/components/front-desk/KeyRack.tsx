import { playGroundSound } from "@/lib/groundSounds";
/**
 * Brass Key Rack — read-only room board for Front Desk.
 * Every hook is derived from data already loaded; tapping a hook only opens
 * the booking sheet. Nothing here changes rooms, bookings or housekeeping.
 */
import { useMemo, useRef, useState } from "react";
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

/**
 * Short fob code — the hero on the tag. "Sea View Villa 3" → "V3",
 * "Standard Single 2" → "S2". Falls back to first letters of words.
 */
function fobCode(name: string): string {
  const words = name.trim().split(/\s+/);
  const numMatch = name.match(/(\d+)\s*$/);
  const num = numMatch ? numMatch[1] : "";
  // Find the word right before the trailing number ("Villa 3" → "Villa")
  const base = numMatch ? name.slice(0, numMatch.index).trim().split(/\s+/).pop() ?? "" : "";
  if (base && num) return (base[0] + num).toUpperCase();
  if (num) return num;
  // No number: initials of up to 3 words
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

export function KeyRack({
  staying, departing, arriving, tasks, onOpen, notes,
}: {
  staying: FrontDeskBooking[];
  departing: FrontDeskBooking[];
  arriving: FrontDeskBooking[];
  tasks: TodayTask[];
  onOpen: (bookingId: string) => void;
  /** Booking ids with an unread guest message (pigeonhole note). */
  notes?: Set<string>;
}) {
  const { data: units } = useUnits();
  // Pull-from-cubby: the slip slides out toward you before the booking opens.
  const [pulling, setPulling] = useState<string | null>(null);
  const pullTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = (hookId: string, bookingId: string) => {
    if (pullTimer.current) return; // one pull at a time
    playGroundSound("brass_clack", 0.5);
    setPulling(hookId);
    pullTimer.current = setTimeout(() => {
      pullTimer.current = null;
      setPulling(null);
      onOpen(bookingId);
    }, 280);
  };

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
        return { id: u.id as string, name: u.name as string, code: fobCode(u.name as string), state, booking };
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
      <div className="key-board">
        <div className="key-grid grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
          {hooks.map((h, i) => {
            const guest = h.booking ? resolveGuestDisplayName(h.booking as any) : null;
            return (
              <div key={h.id} id={`key-slot-${h.id}`} className={cn("key-slot", `key-${h.state}`)}>
                <button
                  type="button"
                  disabled={!h.booking}
                  onClick={() => h.booking && handleOpen(h.id, h.booking.id)}
                  title={`${h.name} · ${guest ?? LABEL[h.state]}`}
                  style={{ animationDelay: `${Math.min(i, 24) * 25}ms` }}
                  className="key-hook min-w-0"
                >
                  <span className="key-led" aria-hidden />
                  {h.booking && notes?.has(h.booking.id) && (
                    <span className="key-note" title="Unread guest message" aria-label="Unread guest message" />
                  )}
                  {/* key={state} forces a remount on state change → swap animation */}
                  {h.state === "vacant" ? (
                    <span key={h.state} className="key-fob key-fob-hanging key-swap-fob" aria-hidden>
                      <span className="key-fob-hole" />
                      <span className="key-code">{h.code}</span>
                    </span>
                  ) : (
                    <span key={h.state} className={cn("key-slip key-swap-slip", pulling === h.id && "key-slip-pulling")}>
                      <span className="key-code">{h.code}</span>
                      {guest && <span className="key-guest">{guest}</span>}
                      <span className="key-state">{LABEL[h.state]}</span>
                    </span>
                  )}
                </button>
                <span className="key-cubby-label">{h.code}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
