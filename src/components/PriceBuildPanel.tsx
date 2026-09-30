/**
 * "How this price was built" — collapsible, read-only receipt under a staff
 * booking total. Explains; never changes a price.
 */
import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { usePriceStory, type PriceStoryBooking } from "@/hooks/usePriceStory";
import { useBookingActiveAdjustments } from "@/hooks/useBookingActiveAdjustments";
import {
  ROLE_EXPLAINER, decimalExplanation, pickupAddonLine, PICKUP_HELPER, linesForAudience, type Audience,
} from "@/lib/pricingClarity";

interface Props {
  booking: PriceStoryBooking;
  policies?: any[] | null;
  addonTotal: number;
  totalPaid: number;
  outstanding: number;
  credit: number;
  audience?: Audience;
}

export function PriceBuildPanel({ booking, policies, addonTotal, totalPaid, outstanding, credit, audience = "staff" }: Props) {
  const [open, setOpen] = useState(false);
  const { story } = usePriceStory(booking, open);
  const { data: adjustments } = useBookingActiveAdjustments(open && audience === "staff" ? booking.id : null);
  const fmt = (n: number) => formatPrice(Math.abs(n), policies);
  const stored = booking.total_price ?? null;
  const decimalNote = decimalExplanation(stored, !!story?.hasPolicy);
  const pickup = pickupAddonLine(addonTotal, (n) => formatPrice(n, policies));

  return (
    <div className="rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-foreground"
        aria-expanded={open}
      >
        How this price was built
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2 text-xs">
          {!story ? (
            <p className="text-muted-foreground">Working out the breakdown…</p>
          ) : (
            linesForAudience(story, audience).map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div>
                  <div>{l.label}</div>
                  {l.detail && <div className="text-[10px] text-muted-foreground">{l.detail}</div>}
                </div>
                <span className="tabular-nums">{l.amount < 0 ? "−" : ""}{fmt(l.amount)}</span>
              </div>
            ))
          )}

          {audience === "staff" && (adjustments ?? []).length > 0 && (
            <div className="space-y-1 rounded bg-muted/40 p-2">
              {(adjustments ?? []).map((a) => (
                <div key={a.id} className="text-[10px] text-muted-foreground">
                  <span className="text-foreground">{a.label}</span>{a.internal_note ? ` — ${a.internal_note}` : ""} ·{" "}
                  {a.applied_at ? new Date(a.applied_at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : "—"}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between border-t border-border/60 pt-1.5 font-medium">
            <span>Room total (stored)</span>
            <span className="tabular-nums">{stored != null ? formatPrice(stored, policies) : "—"}</span>
          </div>
          {pickup && <div className="flex justify-between"><span>{pickup}</span></div>}
          <div className="flex justify-between"><span>Total paid</span><span className="tabular-nums">{formatPrice(totalPaid, policies)}</span></div>
          <div className="flex justify-between">
            <span>{credit > 0 ? "Credit" : "Outstanding"}</span>
            <span className="tabular-nums">{formatPrice(credit > 0 ? credit : outstanding, policies)}</span>
          </div>

          {decimalNote && <p className="flex gap-1.5 text-muted-foreground"><Info className="mt-[1px] h-3 w-3 shrink-0" />{decimalNote}</p>}
          {pickup && <p className="flex gap-1.5 text-muted-foreground"><Info className="mt-[1px] h-3 w-3 shrink-0" />{PICKUP_HELPER}</p>}

          {audience === "staff" && (
            <ul className="space-y-0.5 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
              {ROLE_EXPLAINER.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
