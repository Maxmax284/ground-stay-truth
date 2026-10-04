import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  ArrowLeft, Eye, Banknote, Plane, IdCard, MessageCircle, Check, X,
  AlertTriangle, Mail, Link2, MessageSquare, PlaneTakeoff, Ship, Bus, Car, HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import { PreArrivalChecklist } from "@/components/PreArrivalChecklist";
import { useBooking } from "@/hooks/useBookings";
import { useBookingReadiness, type BookingReadiness } from "@/hooks/useBookingReadiness";
import { useArrivalIntelligence } from "@/hooks/useArrivalIntelligence";
import { useGuestDocuments, REVIEW_STATUS_LABELS, type DocumentReviewStatus } from "@/hooks/useGuestDocuments";
import { useAirportPickup } from "@/hooks/useAirportPickups";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Staff-facing per-booking status page: everything the guest has or hasn't
 * done, in one glance, so staff can chase without guessing. Read-only on all
 * operational data — chase actions are human-sent messages only.
 */

const LEG_ICONS: Record<string, typeof PlaneTakeoff> = {
  flight: PlaneTakeoff,
  ferry: Ship,
  bus: Bus,
  transfer: Car,
  car: Car,
};

function fmtDt(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return format(new Date(iso), "MMM d, HH:mm");
  } catch {
    return null;
  }
}

interface ChaseTarget {
  key: keyof BookingReadiness;
  icon: typeof Eye;
  label: string;
  hint: string;
  suggestion: string;
}

export default function BookingStatus() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: booking, isLoading: bookingLoading, isError } = useBooking(id ?? null);
  const { data: readinessMap } = useBookingReadiness(
    booking ? [{ id: booking.id, guest_id: booking.guest_id }] : undefined
  );
  const readiness = booking ? readinessMap?.[booking.id] : undefined;
  const { data: pickup } = useAirportPickup(id ?? null);
  const { data: documents } = useGuestDocuments(id ?? null);
  const arrival = useArrivalIntelligence(id, {
    guestLandedAt: pickup?.guest_landed_at ?? null,
    guestReadyAt: pickup?.guest_ready_at ?? null,
    collectedAt: pickup?.collected_at ?? null,
    checkedIn: booking?.state === "checked_in",
    pickupRequested: !!pickup,
    driverAssigned: !!pickup?.driver_id,
    driverName: pickup?.drivers?.name ?? null,
    driverPlate: pickup?.drivers?.license_plate ?? null,
    pickupArrivalTime: pickup?.arrival_datetime ?? null,
  });

  if (bookingLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !booking) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-muted-foreground">
          {t("bookingStatus.notFound", "Booking not found.")}
        </div>
      </DashboardLayout>
    );
  }

  const guestName = resolveGuestDisplayName(booking as any);
  const guestEmail = booking.profiles?.email ?? booking.manual_guest_email ?? null;
  const openConflicts = arrival.conflicts.filter((c) => c.status === "open");
  const identityDocs = (documents ?? []).filter((d) => !d.superseded);

  const chaseTargets: ChaseTarget[] = [
    {
      key: "openedPortal",
      icon: Eye,
      label: t("readiness.openedPortal", "Opened portal"),
      hint: t("bookingStatus.hintPortal", "Guest hasn't opened their portal yet — they may have missed the email."),
      suggestion: t("bookingStatus.chasePortal", "Hi! Just checking you got your booking email — your guest portal link is in there. Let us know if you need it resent."),
    },
    {
      key: "paid",
      icon: Banknote,
      label: t("readiness.paid", "Paid"),
      hint: t("bookingStatus.hintPaid", "No payment recorded yet."),
      suggestion: t("bookingStatus.chasePaid", "Hi! A friendly reminder that your deposit is still outstanding. You can pay through the link in your booking email."),
    },
    {
      key: "flightAdded",
      icon: Plane,
      label: t("readiness.flightAdded", "Flight added"),
      hint: t("bookingStatus.hintFlight", "No travel details yet — we can't time the pickup without them."),
      suggestion: t("bookingStatus.chaseFlight", "Hi! Could you add your travel details in your guest portal? We need your arrival time to sort your pickup."),
    },
    {
      key: "idUploaded",
      icon: IdCard,
      label: t("readiness.idUploaded", "ID uploaded"),
      hint: t("bookingStatus.hintId", "No ID or passport uploaded yet — needed for check-in."),
      suggestion: t("bookingStatus.chaseId", "Hi! Could you upload a photo of your passport in your guest portal? We need it for check-in and immigration."),
    },
    {
      key: "messaged",
      icon: MessageCircle,
      label: t("readiness.messaged", "Messaged"),
      hint: t("bookingStatus.hintMessaged", "Guest has never sent a message."),
      suggestion: t("bookingStatus.chaseMessaged", "Hi! Just checking in — reply here any time if you have questions before your stay."),
    },
  ];

  const missing = chaseTargets.filter((c) => readiness && !readiness[c.key]);

  const messageGuest = () => navigate(`/messages?booking=${booking.id}`);

  const copyPortalLink = async () => {
    const url = `${window.location.origin}/guest`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("bookingStatus.linkCopied", "Portal link copied") });
    } catch {
      toast({ title: url, description: t("bookingStatus.copyFailed", "Copy it manually") });
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label={t("common.back", "Back")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-foreground">{guestName}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {booking.units?.name ?? "—"} · {format(new Date(booking.check_in), "MMM d")} – {format(new Date(booking.check_out), "MMM d")}
            </p>
          </div>
          <Badge className={STATE_VARIANTS[booking.state as BookingState]}>{t(`states.${booking.state}`)}</Badge>
        </div>

        {/* 1. Readiness summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("bookingStatus.readiness", "Guest readiness")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {chaseTargets.map(({ key, icon: Icon, label }) => {
              const done = readiness?.[key] ?? false;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full",
                      done ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted/50 text-muted-foreground/60"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn("text-sm", done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 2. Chase actions — only for what's actually missing */}
        {missing.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("bookingStatus.chase", "Chase")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {missing.map((m) => (
                <div key={m.key} className="rounded-lg border p-3">
                  <p className="text-sm font-medium text-foreground">{m.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.hint}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={messageGuest}>
                      <MessageSquare className="mr-1 h-3 w-3" />
                      {t("bookingStatus.messageGuest", "Message guest")}
                    </Button>
                    {guestEmail && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                        <a href={`mailto:${guestEmail}?subject=${encodeURIComponent(`Your stay at Lamai Muay Thai`)}&body=${encodeURIComponent(m.suggestion)}`}>
                          <Mail className="mr-1 h-3 w-3" />
                          {t("bookingStatus.emailGuest", "Email")}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={copyPortalLink}>
                <Link2 className="mr-1 h-3 w-3" />
                {t("bookingStatus.copyPortalLink", "Copy guest portal link")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 3. Travel details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {t("bookingStatus.travel", "Travel details")}
              {openConflicts.length > 0 && (
                <Badge variant="outline" className="border-destructive/50 text-destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {t("bookingStatus.conflicts", { count: openConflicts.length, defaultValue: "{{count}} to check" })}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {arrival.legs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("bookingStatus.noTravel", "No travel details yet. Chase the guest to add them in their portal.")}
              </p>
            ) : (
              arrival.legs.map((leg) => {
                const Icon = LEG_ICONS[leg.leg_type] ?? HelpCircle;
                const fact = leg.flight_fact_id ? arrival.facts[leg.flight_fact_id] : null;
                return (
                  <div key={leg.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-foreground">
                        {leg.marketed_flight_number ?? leg.leg_type}
                        {(leg.from_code || leg.to_code) && (
                          <span className="ml-2 text-muted-foreground">{leg.from_code ?? "?"} → {leg.to_code ?? "?"}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDt(leg.scheduled_departure) ?? t("bookingStatus.noTime", "time unknown")}
                        {leg.scheduled_arrival && ` → ${fmtDt(leg.scheduled_arrival)}`}
                      </p>
                      {fact && fact.flight_status !== "scheduled" && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          {fact.flight_status}
                          {fact.delay_minutes > 0 && ` · +${fact.delay_minutes}m`}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {openConflicts.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link to="/arrivals-board">{t("bookingStatus.resolveConflicts", "Resolve on Arrivals Board")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* 4. ID & documents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("bookingStatus.documents", "ID & documents")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {identityDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("bookingStatus.noDocs", "No ID uploaded yet.")}
              </p>
            ) : (
              identityDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">{doc.document_type} · {fmtDt(doc.created_at)}</p>
                  </div>
                  <Badge
                    variant={doc.review_status === "needs_replacement" ? "destructive" : "secondary"}
                    className="shrink-0 text-[10px]"
                  >
                    {REVIEW_STATUS_LABELS[(doc.review_status ?? "uploaded") as DocumentReviewStatus] ?? doc.review_status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 5. Pickup status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("bookingStatus.pickup", "Pickup")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {!pickup ? (
              <p className="text-muted-foreground">{t("bookingStatus.noPickup", "No pickup requested.")}</p>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("bookingStatus.pickupStatus", "Status")}</span>
                  <span className="font-medium text-foreground">{pickup.status}</span>
                </div>
                {pickup.arrival_datetime && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("bookingStatus.pickupArrival", "Arrival")}</span>
                    <span className="text-foreground">{fmtDt(pickup.arrival_datetime)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("bookingStatus.driver", "Driver")}</span>
                  <span className="text-foreground">
                    {pickup.drivers?.name ?? t("bookingStatus.noDriver", "Not assigned")}
                    {pickup.drivers?.license_plate && ` · ${pickup.drivers.license_plate}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("bookingStatus.landed", "Guest landed")}</span>
                  <span className="text-foreground">{pickup.guest_landed_at ? fmtDt(pickup.guest_landed_at) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("bookingStatus.ready", "Guest ready (\"I'm here\")")}</span>
                  <span className="text-foreground">{pickup.guest_ready_at ? fmtDt(pickup.guest_ready_at) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("bookingStatus.collected", "Collected")}</span>
                  <span className="text-foreground">{pickup.collected_at ? fmtDt(pickup.collected_at) : "—"}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 6. Arrival checklist — read-only view of the guest's progress */}
        <PreArrivalChecklist bookingId={booking.id} readOnly />
      </div>
    </DashboardLayout>
  );
}
