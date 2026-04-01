import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plane, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { airportLabel } from "@/components/ArrivalWelcomeGuide";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Airport inferred from flight tracking data (most reliable) */
  flightAirport: "bkk" | "samui" | null;
  /** Airport inferred from booking arrival_details */
  bookingAirport: "bkk" | "samui" | null;
  guestName?: string | null;
  flightNumber?: string | null;
  isPending: boolean;
  onConfirm: (confirmedAirport: "bkk" | "samui") => void;
}

/**
 * Confirmation dialog shown when guest taps "I've Landed".
 * Cross-checks the guest's selection with flight tracking data
 * and warns if there's a mismatch.
 */
export function LandedConfirmationDialog({
  open, onOpenChange, flightAirport, bookingAirport, guestName, flightNumber, isPending, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const bestGuess = flightAirport ?? bookingAirport;
  const [selected, setSelected] = useState<"bkk" | "samui" | null>(null);

  // Reset selection when dialog opens
  const effectiveSelected = open ? selected : null;

  const mismatch = useMemo(() => {
    if (!effectiveSelected || !flightAirport) return false;
    return effectiveSelected !== flightAirport;
  }, [effectiveSelected, flightAirport]);

  const handleSelect = (airport: "bkk" | "samui") => {
    setSelected(airport);
  };

  const handleConfirm = () => {
    if (effectiveSelected) {
      onConfirm(effectiveSelected);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSelected(null); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-full bg-primary/10">
              <Plane className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">
              {t("guestStay.landed.confirmTitle", "Confirm Your Location")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            {t("guestStay.landed.confirmDesc", "Which airport have you landed at? This helps us send the right driver to the right place.")}
          </DialogDescription>
        </DialogHeader>

        {/* Flight info hint */}
        {flightNumber && flightAirport && (
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

        {/* Airport selection buttons */}
        <div className="grid grid-cols-2 gap-3 my-2">
          <button
            type="button"
            onClick={() => handleSelect("bkk")}
            className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all ${
              effectiveSelected === "bkk"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-primary/40"
            }`}
          >
            <MapPin className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold">BKK</span>
            <span className="text-[10px] text-muted-foreground leading-tight text-center">Suvarnabhumi, Bangkok</span>
            {bestGuess === "bkk" && (
              <Badge variant="secondary" className="absolute -top-2 -right-2 text-[9px]">
                {t("guestStay.landed.suggested", "Suggested")}
              </Badge>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSelect("samui")}
            className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all ${
              effectiveSelected === "samui"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-primary/40"
            }`}
          >
            <MapPin className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold">USM</span>
            <span className="text-[10px] text-muted-foreground leading-tight text-center">Koh Samui</span>
            {bestGuess === "samui" && (
              <Badge variant="secondary" className="absolute -top-2 -right-2 text-[9px]">
                {t("guestStay.landed.suggested", "Suggested")}
              </Badge>
            )}
          </button>
        </div>

        {/* Mismatch warning */}
        {mismatch && (
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
                  selected: airportLabel(effectiveSelected),
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
            variant={mismatch ? "destructive" : "default"}
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.pleaseWait", "Please wait…")}</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> {mismatch
                ? t("guestStay.landed.confirmAnyway", "Confirm Anyway")
                : t("guestStay.landed.confirm", "I've Landed Here")
              }</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
