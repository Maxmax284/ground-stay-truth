import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * How long until check-in.
 *
 * Presentation only: it reads the check-in date already on the booking and
 * counts calendar days in the camp's own terms. It makes no promise about
 * flights, rooms or pickup times, and it changes nothing.
 */

export interface ArrivalCountdownProps {
  /** ISO check-in date from the booking. */
  checkIn: string | null;
  /** Unit name, when the guest already knows which room is theirs. */
  unitName?: string | null;
  now?: Date;
}

/** Days until check-in. Negative means the date has already passed. */
export function daysUntilCheckIn(checkIn: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(checkIn), now);
}

export function ArrivalCountdown({ checkIn, unitName, now = new Date() }: ArrivalCountdownProps) {
  const { t } = useTranslation();
  if (!checkIn) return null;

  const days = daysUntilCheckIn(checkIn, now);
  if (days < 0 || days > 120) return null;

  const headline =
    days === 0
      ? t("arrivalCountdown.today", "You arrive today")
      : days === 1
        ? t("arrivalCountdown.tomorrow", "You arrive tomorrow")
        : t("arrivalCountdown.days", "{{count}} days until you arrive", { count: days });

  const line =
    days === 0
      ? t("arrivalCountdown.todayLine", "Travel at your own pace. Everything you need is on this page.")
      : days <= 3
        ? t("arrivalCountdown.soonLine", "Nearly time. Your flight details and pickup live below.")
        : t("arrivalCountdown.farLine", "Nothing to do yet. We'll bring things forward as your date gets closer.");

  const digits = String(days).padStart(2, "0").split("");

  return (
    <div className="camp-pass">
      <div className="flex items-center gap-4 p-4 pt-5">
        <div className="flex gap-1.5" aria-label={headline} key={days}>
          {digits.map((d, i) => (
            <span key={i} className="camp-flap camp-flap-in" aria-hidden="true">{d}</span>
          ))}
        </div>
        <div className="min-w-0">
          <p className="camp-pass-meta flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {t("arrivalCountdown.label", "Days to camp")}
          </p>
          <p className="font-display text-base font-semibold leading-tight">{headline}</p>
          <p className="text-xs opacity-70">{line}</p>
          {unitName && (
            <p className="camp-pass-mono mt-1 text-[11px] opacity-60">
              {t("arrivalCountdown.room", "Your room: {{name}}", { name: unitName })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
