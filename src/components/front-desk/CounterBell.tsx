/**
 * Counter Bell — lit slip for guests who are physically here but not yet
 * checked in. Read-only: tapping opens the booking; check-in stays a human
 * action on the existing buttons.
 */
import { BellRing } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

export function CounterBell({
  waiting, onOpen,
}: { waiting: FrontDeskBooking[]; onOpen: (id: string) => void }) {
  if (waiting.length === 0) return null;
  return (
    <section className="counter-bell p-3 sm:p-4" aria-live="polite" aria-label="Guests waiting at the counter">
      <div className="flex items-center gap-2 mb-2">
        <BellRing className="h-4 w-4 counter-bell-icon" />
        <span className="board-kicker">Guest in lobby · needs keys</span>
        <span className="ml-auto ink-stamp">{waiting.length}</span>
      </div>
      <ul className="space-y-1.5">
        {waiting.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onOpen(b.id)}
              className="w-full min-w-0 flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-background/40 transition-colors"
            >
              <span className="key-tag shrink-0">{b.units?.name ?? "No room"}</span>
              <span className="truncate font-medium text-sm">{resolveGuestDisplayName(b as any)}</span>
              {b.arrived_at && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(b.arrived_at), { addSuffix: true })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
