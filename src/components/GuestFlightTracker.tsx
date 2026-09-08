import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAirportPickup, useUpsertAirportPickup } from "@/hooks/useAirportPickups";
import { useFlightTrackingBatch, useCheckFlightStatus, FLIGHT_STATUS_CONFIG } from "@/hooks/useFlightTracking";
import { isActivePickup, normalizeArrival } from "@/lib/arrivalModel";
import { formatCampLabeled } from "@/lib/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LandedConfirmationDialog, type LandedAirportCode } from "@/components/LandedConfirmationDialog";
import { Plane, RefreshCcw, Clock, Loader2, PlaneLanding, Pencil, Save, X, Info } from "lucide-react";

interface Props {
  bookingId: string;
  guestName?: string | null;
}

/**
 * Guest-facing flight tracker. The guest owns the flight *details*; staff own the
 * pickup itself (driver, status, fee) — enforced at the database level. Live status
 * is read from the cached tracking row; the refresh button is quota-throttled server side.
 */
export function GuestFlightTracker({ bookingId, guestName }: Props) {
  const { t } = useTranslation();
  const { session, user } = useAuth();
  const qc = useQueryClient();
  const { data: pickup, isLoading } = useAirportPickup(bookingId);
  const upsert = useUpsertAirportPickup();
  const check = useCheckFlightStatus();

  const pickupIds = pickup ? [pickup.id] : [];
  const { data: flightMap } = useFlightTrackingBatch(pickupIds);
  const tracking = pickup ? flightMap?.[pickup.id] : null;

  const [editing, setEditing] = useState(false);
  const [intl, setIntl] = useState("");
  const [domestic, setDomestic] = useState("");
  const [arrival, setArrival] = useState("");
  const [landedOpen, setLandedOpen] = useState(false);
  const [landingPending, setLandingPending] = useState(false);

  // Live wiring: when the flight poller writes a real arrival, the card updates itself.
  const pickupId = pickup?.id ?? null;
  useEffect(() => {
    if (!pickupId) return;
    const channel = supabase
      .channel(`guest-flight-${pickupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flight_tracking", filter: `pickup_id=eq.${pickupId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["flight_tracking_batch"] });
          qc.invalidateQueries({ queryKey: ["airport_pickup", bookingId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "airport_pickups", filter: `id=eq.${pickupId}` },
        () => qc.invalidateQueries({ queryKey: ["airport_pickup", bookingId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pickupId, bookingId, qc]);

  // First look-up is automatic — the guest shouldn't have to tap anything to see status.
  const autoChecked = useRef<string | null>(null);
  const autoFlight = pickup?.flight_number ?? pickup?.international_flight_number ?? null;
  useEffect(() => {
    if (!pickupId || !autoFlight || tracking) return;
    if (autoChecked.current === pickupId) return;
    autoChecked.current = pickupId;
    check.mutate({ pickup_id: pickupId, flight_number: autoFlight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupId, autoFlight, tracking]);

  if (isLoading || !pickup) return null;
  const normalized = normalizeArrival({ ...pickup, driver_id: pickup.driver_id ?? null, confirmed_at: pickup.confirmed_at ?? null });
  if (normalized.arrivalType !== "flight" && !pickup.flight_number && !pickup.international_flight_number) return null;
  if (["cancelled", "completed"].includes(pickup.status)) return null;

  const finalFlight = pickup.flight_number;
  const statusKey = tracking?.flight_status ?? "unknown";
  const statusCfg = FLIGHT_STATUS_CONFIG[statusKey] ?? FLIGHT_STATUS_CONFIG.unknown;
  const hasLanded = statusKey === "landed";
  const canConfirm = isActivePickup(normalized.pickupResolution) && !pickup.guest_landed_at;

  const openEditor = () => {
    setIntl(pickup.international_flight_number ?? "");
    setDomestic(pickup.flight_number ?? "");
    setArrival(pickup.arrival_datetime ? pickup.arrival_datetime.substring(0, 16) : "");
    setEditing(true);
  };

  const saveDetails = async () => {
    const nextIntl = intl.trim().toUpperCase() || null;
    const nextDomestic = domestic.trim().toUpperCase() || null;
    if (!nextIntl && !nextDomestic) {
      toast.error(t("guestFlight.needFlight", "Add at least one flight number."));
      return;
    }
    try {
      await upsert.mutateAsync({
        booking_id: bookingId,
        international_flight_number: nextIntl,
        flight_number: nextDomestic,
        arrival_datetime: arrival ? new Date(arrival).toISOString() : pickup.arrival_datetime,
      } as any);

      // Staff alert through the existing guest message channel — messaging feeds the
      // system, it never changes the pickup itself.
      if (user?.id) {
        const parts = [nextIntl && `first flight ${nextIntl}`, nextDomestic && `arriving flight ${nextDomestic}`]
          .filter(Boolean)
          .join(", ");
        await supabase.from("messages").insert({
          booking_id: bookingId,
          sender_id: user.id,
          is_internal: false,
          content: `Flight details updated: ${parts}${arrival ? ` — arriving ${arrival.replace("T", " ")}` : ""}.`,
        } as any);
      }

      qc.invalidateQueries({ queryKey: ["flight_tracking_batch"] });
      setEditing(false);
      toast.success(t("guestFlight.saved", "Flight details saved. We'll start tracking it."));
    } catch {
      toast.error(t("common.error", "Something went wrong"));
    }
  };

  const refresh = () => {
    const flight = finalFlight ?? pickup.international_flight_number;
    if (!flight) return;
    check.mutate(
      { pickup_id: pickup.id, flight_number: flight, force_refresh: true },
      {
        onSuccess: (res) => {
          if ((res as any)?.cooldown) {
            toast.info(t("guestFlight.cooldown", "Just checked — try again in a minute."));
          } else if ((res as any)?.found === false) {
            toast.info(t("guestFlight.notFound", "We couldn't find that flight yet. Double-check the number."));
          } else {
            toast.success(t("guestFlight.updated", "Flight status updated."));
          }
        },
        onError: (err: any) => toast.error(err?.message ?? t("common.error", "Something went wrong")),
      }
    );
  };

  const confirmLanding = async (confirmedAirport: LandedAirportCode) => {
    setLandingPending(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-landed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ booking_id: bookingId, confirmed_airport: confirmedAirport }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || "Failed to confirm");
      setLandedOpen(false);
      toast.success(
        body.already
          ? t("guestFlight.alreadyConfirmed", "Already confirmed — the team has it.")
          : t("guestFlight.confirmed", "Pickup confirmed. Your driver has been alerted.")
      );
      qc.invalidateQueries({ queryKey: ["airport_pickup", bookingId] });
      qc.invalidateQueries({ queryKey: ["guest-stay-summary-pickups"] });
    } catch (err: any) {
      toast.error(err?.message ?? t("common.error", "Something went wrong"));
    } finally {
      setLandingPending(false);
    }
  };

  const trackedAirport = tracking?.arrival_iata?.toUpperCase();
  const flightAirport = trackedAirport === "BKK" ? "bkk" as const : trackedAirport === "USM" ? "samui" as const : null;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t("guestFlight.title", "Your flight")}
            </span>
          </div>
          {!editing && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={openEditor}>
              <Pencil className="h-3 w-3" /> {t("guestFlight.edit", "Edit details")}
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="gft-intl">
                {t("guestFlight.intlLabel", "Flight into Thailand (optional)")}
              </Label>
              <Input
                id="gft-intl"
                value={intl}
                onChange={(e) => setIntl(e.target.value)}
                placeholder="EK384"
                className="h-9 font-mono"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="gft-dom">
                {t("guestFlight.finalLabel", "Flight landing on Samui")}
              </Label>
              <Input
                id="gft-dom"
                value={domestic}
                onChange={(e) => setDomestic(e.target.value)}
                placeholder="PG5125"
                className="h-9 font-mono"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="gft-arrival">
                {t("guestFlight.arrivalLabel", "Landing time (optional)")}
              </Label>
              <Input
                id="gft-arrival"
                type="datetime-local"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={saveDetails} disabled={upsert.isPending}>
                {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {t("common.save", "Save")}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setEditing(false)}>
                <X className="h-3 w-3" /> {t("common.cancel", "Cancel")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("guestFlight.editHint", "You can change your flight anytime. The front desk is notified automatically — your driver and pickup fee stay with the team.")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {pickup.international_flight_number && (
                <span className="font-mono text-muted-foreground">{pickup.international_flight_number}</span>
              )}
              {finalFlight && <span className="font-mono font-medium text-foreground">{finalFlight}</span>}
              {!finalFlight && !pickup.international_flight_number && (
                <span className="text-muted-foreground">
                  {t("guestFlight.noFlight", "No flight number yet — add it so we can track you.")}
                </span>
              )}
              <Badge className={`ml-auto text-[10px] ${statusCfg.color}`}>
                {statusCfg.emoji} {statusCfg.label}
              </Badge>
            </div>

            {tracking && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {tracking.scheduled_arrival && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatCampLabeled(tracking.scheduled_arrival)}
                  </span>
                )}
                {tracking.delay_minutes > 0 && (
                  <span className="text-orange-600 dark:text-orange-400">+{tracking.delay_minutes} min late</span>
                )}
                {tracking.terminal && <span>Terminal {tracking.terminal}</span>}
                {tracking.gate && <span>Gate {tracking.gate}</span>}
                {tracking.last_checked_at && (
                  <span>{t("guestFlight.checked", "Checked")} {formatCampLabeled(tracking.last_checked_at)}</span>
                )}
              </div>
            )}

            {!tracking && (finalFlight || pickup.international_flight_number) && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <p>{t("guestFlight.pending", "We haven't pulled your flight yet. Tap check status for a live read.")}</p>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={refresh}
                disabled={check.isPending || (!finalFlight && !pickup.international_flight_number)}
              >
                {check.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                {t("guestFlight.check", "Check status")}
              </Button>
              {canConfirm && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  variant={hasLanded ? "default" : "outline"}
                  onClick={() => setLandedOpen(true)}
                >
                  <PlaneLanding className="h-3 w-3" />
                  {t("guestFlight.confirmPickup", "I've landed — confirm pickup")}
                </Button>
              )}
              {pickup.guest_landed_at && (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px] self-center">
                  {t("guestFlight.landedBadge", "Landing confirmed")}
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>

      <LandedConfirmationDialog
        open={landedOpen}
        onOpenChange={setLandedOpen}
        flightAirport={flightAirport}
        bookingAirport={null}
        guestName={guestName}
        flightNumber={finalFlight}
        internationalFlightNumber={pickup.international_flight_number}
        pickupStatus={pickup.status}
        isPending={landingPending}
        onConfirm={confirmLanding}
      />
    </Card>
  );
}
