/**
 * Operational shortcut chips.
 *
 * One tap = compact answer in the chat + a temporary spotlight on the matching
 * rows already rendered on the current page. Never navigates, never opens a
 * panel. Staff only — guests get the normal prompt deck.
 */
import { SHORTCUTS, collectSpotlightRows, resolveShortcutTargets, type ShortcutDef } from "@/lib/aiShortcuts";
import { setSpotlight, clearSpotlight } from "@/lib/spotlightStore";

interface Props {
  onAsk: (prompt: string) => void;
  /** Only render shortcuts whose records can plausibly be on this page. */
  className?: string;
}

export function ShortcutChips({ onAsk, className }: Props) {
  const handle = (sc: ShortcutDef) => {
    const rows = collectSpotlightRows();
    const ids = resolveShortcutTargets(sc, rows);
    if (ids.length > 0) {
      setSpotlight({ kind: sc.kind, ids, reason: sc.label, source: "shortcut" });
    } else {
      clearSpotlight();
    }
    onAsk(sc.prompt);
  };

  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
        Point at it
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SHORTCUTS.map((sc) => (
          <button
            key={sc.key}
            onClick={() => handle(sc)}
            className="px-2.5 py-1 rounded-full border border-border bg-background/60 text-[11px] text-foreground hover:bg-accent hover:border-primary/40 transition-colors"
          >
            {sc.label}
          </button>
        ))}
      </div>
    </div>
  );
}
