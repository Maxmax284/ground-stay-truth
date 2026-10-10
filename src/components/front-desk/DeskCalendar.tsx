import { playGroundSound } from "@/lib/groundSounds";
/**
 * Desk Calendar — 7-day strip under the key rack.
 * Arrivals, departures and airport pickups, one chip per event.
 * Tapping a chip flashes its cubby on the rack and opens the booking.
 * Read-only: nothing here changes bookings, rooms or pickups.
 */
import { useMemo } from "react";
import { format, addDays } from "date-fns";
import { LogIn, LogOut, Car } from "lucide-react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { cn } from "@/lib/utils";

type EventKind = "arrival" | "departure" | "pickup";

type DeskEvent = {
  key: string;
  kind: EventKind;
  bookingId: string;
  unitId: string | null;
  label: string;
  sub?: string;
};

const KIND_ICON: Record<EventKind, typeof LogIn> = {
  arrival: LogIn,
  departure: LogOut,
  pickup: Car,
};

/** Scroll to the cubby on the key rack and flash it. */
function flashCubby(unitId: string | null) {
  if (!unitId) return;
  const el = document.getElementById(`key-slot-${unitId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("key-slot-flash");
  // Force reflow so the animation restarts on repeat taps
  void el.offsetWidth;
  el.classList.add("key-slot-flash");
  window.setTimeout(() => el.classList.remove("key-slot-flash"), 1600);
}

export function DeskCalendar({
  staying,
  departing,
  arriving,
  upcoming,
  pickupByBooking,
  onOpen,
}: {
  staying: FrontDeskBooking[];
  departing: FrontDeskBooking[];
  arriving: FrontDeskBooking[];
  upcoming: FrontDeskBooking[];
  pickupByBooking?: Map<string, { status: string | null; arrival_datetime: string | null }>;
  onOpen: (bookingId: string) => void;
}) {
  const days = useMemo(() => {
    const today = new Date();
    const all = [...staying, ...departing, ...arriving, ...upcoming];
    const byId = new Map(all.map((b) => [b.id, b]));

    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i);
      const key = format(day, "yyyy-MM-dd");
      const events: DeskEvent[] = [];

      for (const b of all) {
        const name = resolveGuestDisplayName(b as any) || "Guest";
        if (b.check_in === key && b.state !== "cancelled" && b.state !== "no_show") {
          events.push({
            key: `in-${b.id}`,
            kind: "arrival",
            bookingId: b.id,
            unitId: b.unit_id,
            label: name,
            sub: b.units?.name ?? undefined,
          });
        }
        if (b.check_out === key && b.state === "checked_in") {
          events.push({
            key: `out-${b.id}`,
            kind: "departure",
            bookingId: b.id,
            unitId: b.unit_id,
            label: name,
            sub: b.units?.name ?? undefined,
          });
        }
      }

      // Pickups landing this day (from the live pickup map)
      pickupByBooking?.forEach((p, bookingId) => {
        if (p.arrival_datetime?.slice(0, 10) !== key) return;
        const b = byId.get(bookingId);
        events.push({
          key: `pickup-${bookingId}`,
          kind: "pickup",
          bookingId,
          unitId: b?.unit_id ?? null,
          label: b ? resolveGuestDisplayName(b as any) || "Guest" : "Pickup",
          sub: p.arrival_datetime
            ? format(new Date(p.arrival_datetime), "HH:mm")
            : undefined,
        });
      });

      // Arrivals first, then pickups, then departures
      const order: Record<EventKind, number> = { arrival: 0, pickup: 1, departure: 2 };
      events.sort((a, b2) => order[a.kind] - order[b2.kind]);

      return { key, day, events };
    });
  }, [staying, departing, arriving, upcoming, pickupByBooking]);

  const totalEvents = days.reduce((n, d) => n + d.events.length, 0);

  return (
    <section className="board-panel desk-calendar p-3 sm:p-4" aria-label="Week ahead">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="board-kicker">Week ahead</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1"><LogIn className="h-3 w-3 text-[hsl(var(--fight-gold))]" /> In</span>
          <span className="flex items-center gap-1"><Car className="h-3 w-3 text-[hsl(217_91%_65%)]" /> Pickup</span>
          <span className="flex items-center gap-1"><LogOut className="h-3 w-3 text-[hsl(var(--fight-red))]" /> Out</span>
        </div>
      </div>
      {totalEvents === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Quiet week — nothing on the books for the next 7 days.
        </p>
      ) : (
        <div className="desk-cal-grid">
          {days.map((d, i) => (
            <div key={d.key} className={cn("desk-cal-day", i === 0 && "desk-cal-today")}>
              <div className="desk-cal-head">
                <span className="desk-cal-dow">{format(d.day, "EEE")}</span>
                <span className="desk-cal-date">{format(d.day, "d MMM")}</span>
              </div>
              <div className="desk-cal-events">
                {d.events.length === 0 ? (
                  <span className="desk-cal-empty" aria-hidden>·</span>
                ) : (
                  d.events.map((ev) => {
                    const Icon = KIND_ICON[ev.kind];
                    return (
                      <button
                        key={ev.key}
                        type="button"
                        title={`${ev.label}${ev.sub ? ` · ${ev.sub}` : ""}`}
                        onClick={() => {
                          playGroundSound("brass_clack", 0.4);
                          flashCubby(ev.unitId);
                          onOpen(ev.bookingId);
                        }}
                        className={cn("desk-cal-chip", `desk-cal-${ev.kind}`)}
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{ev.label}</span>
                        {ev.sub && <span className="desk-cal-sub shrink-0">{ev.sub}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
