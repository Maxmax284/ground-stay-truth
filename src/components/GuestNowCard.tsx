import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { CreditCard, Plane, Home, CalendarDays, MessageSquare, Mail } from "lucide-react";

export type NowState = "deposit" | "flight" | "onsite" | "quiet" | "none";

interface Props {
  state: NowState;
  unitName?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nightsAway?: number | null;
  contactEmail?: string | null;
  messagingLinked?: boolean;
  onGo: (tab: string, section?: string) => void;
}

function maskEmail(email?: string | null) {
  if (!email || !email.includes("@")) return null;
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.max(1, name.length - 1))}@${domain}`;
}

/**
 * The single "Now" card. One operational state, one obvious next move — this
 * replaces the old stack of banners at the top of the guest portal. Everything
 * else lives one tap deeper.
 */
export function GuestNowCard({
  state,
  unitName,
  checkIn,
  checkOut,
  nightsAway,
  contactEmail,
  messagingLinked,
  onGo,
}: Props) {
  const { t } = useTranslation();
  if (state === "none") return null;

  const masked = maskEmail(contactEmail);

  const config = {
    deposit: {
      icon: CreditCard,
      tag: t("nowCard.tagAction", "Action needed"),
      title: t("nowCard.depositTitle", "Your deposit is still open"),
      body: t("nowCard.depositBody", "Pay the deposit and your room is locked in. Takes under a minute on your phone."),
      cta: t("nowCard.depositCta", "Pay deposit"),
      go: () => onGo("bookings", "deposit"),
    },
    flight: {
      icon: Plane,
      tag: t("nowCard.tagTravel", "On the way"),
      title: t("nowCard.flightTitle", "Track your flight in"),
      body: t("nowCard.flightBody", "We watch your flight live. Land, tap \"I've landed\", and your driver moves."),
      cta: t("nowCard.flightCta", "Open flight radar"),
      go: () => onGo("bookings", "landed"),
    },
    onsite: {
      icon: Home,
      tag: t("nowCard.tagOnsite", "You're checked in"),
      title: t("nowCard.onsiteTitle", "Everything for your stay"),
      body: t("nowCard.onsiteBody", "WiFi, house rules, laundry, maintenance — and a direct line to the front desk."),
      cta: t("nowCard.onsiteCta", "Stay support"),
      go: () => onGo("stay-support"),
    },
    quiet: {
      icon: CalendarDays,
      tag: t("nowCard.tagBooked", "Booked"),
      title: t("nowCard.quietTitle", "You're all set"),
      body: t("nowCard.quietBody", "Nothing needs doing right now. We'll reach out before you travel."),
      cta: t("nowCard.quietCta", "View booking"),
      go: () => onGo("bookings"),
    },
  }[state];

  const Icon = config.icon;
  const tone = state === "deposit" ? "camp-tone-action" : state === "flight" ? "camp-tone-travel" : "camp-tone-locked";

  return (
    <div className="camp-pass board-flip-soft">
      <div className="p-4 pt-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="camp-pass-meta">{t("nowCard.station", "Lamai Muay Thai · Koh Samui")}</span>
          {typeof nightsAway === "number" && nightsAway > 0 && (
            <span className="camp-pass-meta">
              {t("nowCard.daysAway", { defaultValue: "{{count}} days out", count: nightsAway })}
            </span>
          )}
        </div>
        <div className="flex items-start gap-3">
          <div className={`rounded-md border border-current/30 p-2 shrink-0 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <span className={`camp-stamp ${tone}`}>
              <span className="camp-led" aria-hidden="true" />
              {config.tag}
            </span>
            <p className="font-stat tracking-wide text-lg font-semibold leading-tight">{config.title}</p>
            <p className="text-xs opacity-70">{config.body}</p>
          </div>
        </div>

        {(unitName || checkIn) && (
          <div className="camp-pass-perf -mx-4 px-4 pt-3 grid grid-cols-2 gap-3">
            {unitName && (
              <div className="min-w-0">
                <p className="camp-pass-meta">{t("nowCard.room", "Room")}</p>
                <p className="camp-pass-mono text-sm font-semibold truncate">{unitName}</p>
              </div>
            )}
            {checkIn && (
              <div className="min-w-0">
                <p className="camp-pass-meta">{t("nowCard.dates", "Dates")}</p>
                <p className="camp-pass-mono text-sm font-semibold">
                  {format(new Date(checkIn), "dd MMM").toUpperCase()}
                  {checkOut ? ` → ${format(new Date(checkOut), "dd MMM").toUpperCase()}` : ""}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" className="h-10 sm:h-9 text-xs flex-1 sm:flex-none min-w-[8rem]" onClick={config.go}>
            {config.cta}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 sm:h-9 text-xs gap-1.5 flex-1 sm:flex-none min-w-[8rem] bg-transparent border-current/30 text-inherit hover:bg-background/10 hover:text-inherit"
            onClick={() => onGo("messages")}
          >
            <MessageSquare className="h-3 w-3" />
            {t("nowCard.frontDesk", "Message front desk")}
          </Button>
        </div>

        {/* Channel clarity — say out loud where our signals land */}
        <p className="flex min-w-0 items-start gap-1.5 text-[11px] opacity-60">
          <Mail className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {masked
              ? t("nowCard.channelEmail", { defaultValue: "Updates go to {{email}}", email: masked })
              : t("nowCard.channelEmailGeneric", "Updates go to your email")}
            {messagingLinked
              ? ` ${t("nowCard.channelMessaging", "and your linked chat — you don't need to keep this page open.")}`
              : ` · ${t("nowCard.channelHint", "Link WhatsApp or Telegram below and we'll buzz you there too.")}`}
          </span>
        </p>
      </div>
    </div>
  );
}

export function computeNowState(args: {
  pendingDeposit: boolean;
  checkedIn: boolean;
  confirmedCheckIn?: string | null;
  hasAnyBooking: boolean;
}): NowState {
  if (!args.hasAnyBooking) return "none";
  if (args.pendingDeposit) return "deposit";
  if (args.checkedIn) return "onsite";
  if (args.confirmedCheckIn) {
    const days = differenceInCalendarDays(new Date(args.confirmedCheckIn), new Date());
    if (days <= 2) return "flight";
  }
  return "quiet";
}
