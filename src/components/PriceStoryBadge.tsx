/**
 * Price Story badge — the emblem that stops the "why doesn't this number match
 * the rack rate?" phone call.
 *
 * Rules of this component:
 *   - Read only. It explains price, it never changes price. Applying a discount
 *     stays in ApplyDiscountDialog with its own eligibility lock.
 *   - Two colours on purpose: automatic policy discounting (info) vs a human
 *     override (warning). One means "the system did its job", the other means
 *     "a person made a call".
 *   - The receipt always ends with the consequence in words, so nobody has to
 *     infer why outstanding looks the way it does.
 *
 * Cheap by default: the full re-quote only runs once the badge is opened.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Percent, Scissors, Info } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { usePriceStory, useBookingDiscountFlags, type PriceStoryBooking } from "@/hooks/usePriceStory";
import { detectPolicyDiscountHint, nightsBetweenDates } from "@/lib/priceStory";
import type { PolicySetting } from "@/hooks/usePolicySettings";
import { cn } from "@/lib/utils";

interface Props {
  booking: PriceStoryBooking;
  /** Preloaded policy rows — avoids a refetch on list surfaces. */
  policies?: PolicySetting[] | null;
  /** Batch flag from `useBookingDiscountFlags` so list rows cost one query. */
  flag?: { count: number; net: number; hasDiscount: boolean; hasSurcharge: boolean };
  /** `pill` shows the amount, `dot` is icon-only for tight rows / calendar bars. */
  variant?: "pill" | "dot";
  className?: string;
}

export function PriceStoryBadge({ booking, policies, flag, variant = "pill", className }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { story } = usePriceStory(booking, open);

  const nights = nightsBetweenDates(booking.check_in, booking.check_out);
  const policyHint = detectPolicyDiscountHint(nights, (policies ?? null) as PolicySetting[] | null);
  const humanHint = !!flag && flag.count > 0;

  // Nothing detectable and nothing loaded yet → no emblem at all.
  if (!story && !policyHint && !humanHint) return null;
  if (story && story.origin === "none") return null;

  const origin = story?.origin ?? (humanHint && policyHint ? "both" : humanHint ? "human" : "policy");
  const isHuman = origin === "human" || origin === "both";

  const tone = isHuman
    ? "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]"
    : "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]";

  const amount = story
    ? story.totalDiscount
    : humanHint && flag
      ? Math.abs(flag.net)
      : 0;

  const label = variant === "dot"
    ? null
    : amount > 0
      ? `−${formatPrice(amount, policies)}`
      : policyHint
        ? `${policyHint.percentage}%`
        : "Adjusted";

  const Icon = isHuman ? Scissors : Percent;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* A span, not a button: this badge lives inside clickable rows and cards,
            and a nested button is invalid markup. Clicks are swallowed so opening
            the receipt never also opens the booking. */}
        <span
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("priceStory.badgeLabel", "This booking has a price adjustment — see why")}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          onMouseEnter={() => {
            if (window.matchMedia?.("(hover: hover)").matches) setOpen(true);
          }}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            tone,
            className
          )}
        >
          <Icon className="h-2.5 w-2.5 shrink-0" />
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[300px] p-3 text-xs"
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => setOpen(false)}
      >
        <PriceStoryReceipt story={story} policies={policies} loading={!story} isHuman={isHuman} />
      </PopoverContent>
    </Popover>
  );
}

function PriceStoryReceipt({
  story,
  policies,
  loading,
  isHuman,
}: {
  story: ReturnType<typeof usePriceStory>["story"];
  policies?: PolicySetting[] | null;
  loading: boolean;
  isHuman: boolean;
}) {
  const fmt = (n: number) => formatPrice(Math.abs(n), policies);

  if (loading || !story) {
    return (
      <div className="space-y-1.5">
        <p className="font-medium text-foreground">Price adjusted</p>
        <p className="text-muted-foreground">Working out the exact breakdown…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-foreground">
          {story.humanSurcharge > 0 && story.totalDiscount === 0 ? "Price adjusted" : "Discount applied"}
        </p>
        <span className={`tabular-nums font-semibold ${isHuman ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--info))]"}`}>
          −{fmt(story.totalDiscount)}
        </span>
      </div>

      <div className="space-y-1 border-t border-border/60 pt-1.5">
        {story.lines.map((line, i) => (
          <div key={`${line.label}-${i}`} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={line.kind === "policy" || line.kind === "human" ? "" : "text-muted-foreground"}>
                {line.label}
              </span>
              {line.detail && <div className="text-[10px] text-muted-foreground">{line.detail}</div>}
            </div>
            <span
              className={`shrink-0 tabular-nums ${
                line.amount < 0
                  ? line.kind === "human"
                    ? "text-[hsl(var(--warning))]"
                    : "text-[hsl(var(--info))]"
                  : "text-muted-foreground"
              }`}
            >
              {line.amount < 0 ? "−" : ""}
              {fmt(line.amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 font-medium text-foreground">
        <span>Charged</span>
        <span className="tabular-nums">{fmt(story.chargedTotal)}</span>
      </div>

      {Math.abs(story.drift) >= 1 && story.storedTotal != null && (
        <div className="rounded-md bg-[hsl(var(--warning))]/10 p-2 text-[10px] leading-relaxed text-warning-foreground">
          <strong>Heads up:</strong> the booking is stored at {fmt(story.storedTotal)}, which is{" "}
          {fmt(story.drift)} {story.drift > 0 ? "more" : "less"} than today's rates give. The balance
          uses the stored total. Nothing is broken — the stay was priced before a rate or policy change.
        </div>
      )}

      <p className="flex gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-[1px] h-3 w-3 shrink-0" />
        <span>{story.consequence}</span>
      </p>
    </div>
  );
}

/** Convenience re-export so list surfaces import from one place. */
export { useBookingDiscountFlags };
