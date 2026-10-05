import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Card className="board-flip-soft border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {config.tag}
              </Badge>
              {typeof nightsAway === "number" && nightsAway > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {t("nowCard.daysAway", { defaultValue: "{{count}} days out", count: nightsAway })}
                </span>
              )}
            </div>
            <p className="text-base font-semibold text-foreground leading-tight">{config.title}</p>
            <p className="text-xs text-muted-foreground">{config.body}</p>
            {(unitName || checkIn) && (
              <p className="text-[11px] text-muted-foreground font-medium">
                {unitName}
                {unitName && checkIn ? " · " : ""}
                {checkIn ? format(new Date(checkIn), "d MMM") : ""}
                {checkOut ? ` – ${format(new Date(checkOut), "d MMM")}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8 text-xs" onClick={config.go}>
            {config.cta}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => onGo("messages")}>
            <MessageSquare className="h-3 w-3" />
            {t("nowCard.frontDesk", "Message front desk")}
          </Button>
        </div>

        {/* Channel clarity — say out loud where our signals land */}
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Mail className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            {masked
              ? t("nowCard.channelEmail", { defaultValue: "Updates go to {{email}}", email: masked })
              : t("nowCard.channelEmailGeneric", "Updates go to your email")}
            {messagingLinked
              ? ` ${t("nowCard.channelMessaging", "and your linked chat — you don't need to keep this page open.")}`
              : ` · ${t("nowCard.channelHint", "Link WhatsApp or Telegram below and we'll buzz you there too.")}`}
          </span>
        </p>
      </CardContent>
    </Card>
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
