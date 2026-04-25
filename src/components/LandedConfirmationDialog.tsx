import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getTravelState, type TravelStateInfo } from "@/lib/travelState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plane, MapPin, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { airportLabel } from "@/components/ArrivalWelcomeGuide";

export type LandedAirportCode = "bkk" | "dmk" | "urt" | "samui";

interface AirportOption {
  code: LandedAirportCode;
  label: string;
  sub: string;
  transitHint: string; // shown when guest has a connecting flight
  finalHint: string;   // shown when this is the final destination
}

const AIRPORT_OPTIONS: AirportOption[] = [
  { code: "bkk", label: "BKK", sub: "Suvarnabhumi, Bangkok", transitHint: "Still in transit", finalHint: "Bangkok arrival" },
  { code: "dmk", label: "DMK", sub: "Don Mueang, Bangkok", transitHint: "Still in transit", finalHint: "Bangkok arrival" },
  { code: "urt", label: "URT", sub: "Surat Thani (mainland)", transitHint: "Ferry leg pending", finalHint: "Mainland — ferry pending" },
  { code: "samui", label: "USM", sub: "Koh Samui", transitHint: "Final destination", finalHint: "On the island" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Airport inferred from flight tracking data (most reliable) — currently bkk/samui only */
  flightAirport: "bkk" | "samui" | null;
  /** Airport inferred from booking arrival_details */
  bookingAirport: "bkk" | "samui" | null;
  guestName?: string | null;
  flightNumber?: string | null;
  /** The international flight number for context */
  internationalFlightNumber?: string | null;
  /** Current pickup status */
  pickupStatus?: string;
  isPending: boolean;
  onConfirm: (confirmedAirport: LandedAirportCode) => void;
}

/**
 * Confirmation dialog shown when guest taps "I've Landed".
 * Supports four arrival nodes: BKK, DMK (Bangkok budget hub), URT (Surat Thani — ferry route),
 * and USM (Koh Samui, the only "true arrival"). Mainland nodes resolve as in_transit.
 */
export function LandedConfirmationDialog({
  open, onOpenChange, flightAirport, bookingAirport, flightNumber,
  internationalFlightNumber, pickupStatus, isPending, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const bestGuess: LandedAirportCode | null = flightAirport ?? bookingAirport;
  const [selected, setSelected] = useState<LandedAirportCode | null>(null);

  const effectiveSelected = open ? selected : null;

  // Use centralized travel state to interpret the guest's selection
  const prospectiveState = useMemo((): TravelStateInfo | null => {
    if (!effectiveSelected) return null;
    return getTravelState({
      status: pickupStatus ?? "requested",
      flight_number: flightNumber ?? null,
      international_flight_number: internationalFlightNumber ?? null,
      final_flight_confirmed: false,
      confirmed_airport: effectiveSelected,
      guest_landed_at: new Date().toISOString(),
      arrival_datetime: null,
    });
  }, [effectiveSelected, flightNumber, internationalFlightNumber, pickupStatus]);

  const hasConnectingFlight = !!internationalFlightNumber;
  const isTransitWarning = prospectiveState?.isInTransit === true;

  // Mismatch only meaningful when flight tracking gives us a known airport AND the guest picked a different one in the same set (bkk vs samui).
  const mismatch = useMemo(() => {
    if (!effectiveSelected || !flightAirport) return false;
    if (effectiveSelected === "dmk" || effectiveSelected === "urt") return false; // budget routes don't show in flight tracking yet
    return effectiveSelected !== flightAirport;
  }, [effectiveSelected, flightAirport]);

  const handleConfirm = () => {
    if (effectiveSelected) onConfirm(effectiveSelected);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSelected(null); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-full bg-primary/10">
              <Plane className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">
              {hasConnectingFlight
                ? t("guestStay.landed.connectingTitle", "Where are you right now?")
                : t("guestStay.landed.confirmTitle", "Where did you land?")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            {t(
              "guestStay.landed.confirmDescV2",
              "Tap the closest match. Only Koh Samui (USM) means you've truly arrived — the others are mainland transit points."
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Connecting flight context */}
        {hasConnectingFlight && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2.5 text-xs text-muted-foreground">
            <Plane className="h-3.5 w-3.5 shrink-0" />
            <span>{internationalFlightNumber}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
            <span className="font-medium text-foreground">{flightNumber ?? "Final leg"}</span>
          </div>
        )}

        {/* Flight info hint (non-connecting) */}
        {!hasConnectingFlight && flightNumber && flightAirport && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2.5 text-xs text-muted-foreground">
            <Plane className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t("guestStay.landed.flightHint", "Flight {{flight}} arrives at {{airport}}", {
                flight: flightNumber,
                airport: airportLabel(flightAirport),
              })}
            </span>
          </div>
        )}

        {/* 2×2 airport selection grid */}
        <div className="grid grid-cols-2 gap-2.5 my-2">
          {AIRPORT_OPTIONS.map((opt) => {
            const isSelected = effectiveSelected === opt.code;
            const isSuggested = bestGuess === opt.code;
            const isMainlandTransit = opt.code !== "samui";
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setSelected(opt.code)}
                className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <MapPin className={`h-5 w-5 ${opt.code === "samui" ? "text-[hsl(var(--success))]" : "text-primary"}`} />
                <span className="text-sm font-semibold leading-none">{opt.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{opt.sub}</span>
                {isSuggested && (
                  <Badge variant="secondary" className="absolute -top-2 -right-2 text-[9px]">
                    {t("guestStay.landed.suggested", "Suggested")}
                  </Badge>
                )}
                <span
                  className={`text-[9px] mt-0.5 leading-tight ${
                    isMainlandTransit ? "text-muted-foreground" : "text-[hsl(var(--success))] font-medium"
                  }`}
                >
                  {hasConnectingFlight ? opt.transitHint : opt.finalHint}
                </span>
              </button>
            );
          })}
        </div>

        {/* Transit warning — derived from centralized travel state */}
        {isTransitWarning && (
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-warning-foreground">
                {t("guestStay.landed.transitTitle", "You're still in transit")}
              </p>
              <p className="text-muted-foreground">
                {prospectiveState?.guestGuidance ??
                  t("guestStay.landed.transitDesc", "You haven't reached Koh Samui yet. We'll log this and your driver will be sent when you arrive on the island.")}
              </p>
            </div>
          </div>
        )}

        {/* Mismatch warning */}
        {mismatch && !isTransitWarning && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive">
                {t("guestStay.landed.mismatchTitle", "This doesn't match your flight")}
              </p>
              <p className="text-muted-foreground">
                {t("guestStay.landed.mismatchDesc", "Our records show flight {{flight}} arrives at {{expected}}. You selected {{selected}}. If you're sure, tap confirm — staff will double-check.", {
                  flight: flightNumber ?? "your flight",
                  expected: airportLabel(flightAirport),
                  selected: effectiveSelected?.toUpperCase(),
                })}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => { setSelected(null); onOpenChange(false); }} disabled={isPending}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!effectiveSelected || isPending}
            className="gap-1.5"
            variant={mismatch && !isTransitWarning ? "destructive" : "default"}
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.pleaseWait", "Please wait…")}</>
            ) : isTransitWarning ? (
              <><Plane className="h-4 w-4" /> {t("guestStay.landed.confirmTransit", "Got it — I'm in transit")}</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> {mismatch
                ? t("guestStay.landed.confirmAnyway", "Confirm anyway")
                : t("guestStay.landed.confirm", "I've landed here")
              }</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
