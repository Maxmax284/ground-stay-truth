/**
 * Guest Journey Timeline — read-only horizontal stepper.
 * Derives every step status from data already loaded on the booking.
 * No new business rules; no mutations.
 */
import { useTranslation } from "react-i18next";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { CheckCircle2, Circle, AlertCircle, Plane, Bed, LogIn, LogOut, FileText, CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCampLabeled } from "@/lib/timezone";

type StepState = "done" | "active" | "problem" | "todo" | "skipped";

interface Step {
  label: string;
  icon: any;
  state: StepState;
  hint?: string;
}

export function GuestJourneyTimeline({
  booking,
  pickup,
}: {
  booking: FrontDeskBooking;
  pickup?: { status: string | null; arrival_datetime: string | null } | null;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const isArrived = !!booking.arrived_at;
  const isCheckedIn = booking.state === "checked_in";
  const isDeparted = booking.state === "completed";
  const isCancelled = booking.state === "cancelled" || booking.state === "no_show";
  const arrivingTodayOrPast = booking.check_in <= today;
  const departingTodayOrPast = booking.check_out <= today;

  const steps: Step[] = [
    {
      label: t("frontDesk.journey.booked"),
      icon: CheckCircle2,
      state: "done",
    },
    {
      label: booking.depositPaid ? t("frontDesk.journey.depositPaid") : t("frontDesk.journey.deposit"),
      icon: CreditCard,
      state: booking.depositPaid ? "done" : "problem",
      hint: booking.depositPaid ? undefined : t("frontDesk.journey.unpaid"),
    },
    {
      label: t("frontDesk.journey.idDocs"),
      icon: FileText,
      state:
        booking.docCount > 0
          ? "done"
          : arrivingTodayOrPast
            ? "problem"
            : "todo",
      hint: booking.docCount > 0 ? t("frontDesk.journey.onFile", { count: booking.docCount }) : t("frontDesk.journey.missing"),
    },
    pickup
      ? {
          label: t("frontDesk.journey.pickup"),
          icon: Plane,
          state:
            pickup.status === "completed"
              ? "done"
              : pickup.status === "in_progress" || pickup.status === "assigned"
                ? "active"
                : "todo",
          hint: pickup.arrival_datetime
            ? formatCampLabeled(pickup.arrival_datetime, "time")
            : pickup.status ?? undefined,
        }
      : null,
    {
      label: t("frontDesk.journey.arrival"),
      icon: Bed,
      state: isArrived || isCheckedIn || isDeparted ? "done" : arrivingTodayOrPast ? "active" : "todo",
    },
    {
      label: t("frontDesk.journey.checkIn"),
      icon: LogIn,
      state: isCheckedIn || isDeparted ? "done" : isArrived ? "active" : "todo",
    },
    {
      label: t("frontDesk.journey.stay"),
      icon: Sparkles,
      state: isDeparted ? "done" : isCheckedIn ? "active" : "todo",
    },
    {
      label: t("frontDesk.journey.checkOut"),
      icon: LogOut,
      state: isDeparted
        ? "done"
        : isCheckedIn && departingTodayOrPast
          ? "active"
          : booking.outstanding > 0 && isCheckedIn
            ? "problem"
            : "todo",
      hint: booking.outstanding > 0 && isCheckedIn ? t("frontDesk.journey.balanceOwed") : undefined,
    },
  ].filter(Boolean) as Step[];

  if (isCancelled) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        {t("frontDesk.journey.halted", { state: booking.state.replace("_", " ") })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1 -mx-1 px-1">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center shrink-0">
          <StepDot step={s} />
          {i < steps.length - 1 && (
            <div
              className={cn(
                "w-4 h-px",
                s.state === "done" ? "bg-[hsl(var(--success))]" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StepDot({ step }: { step: Step }) {
  const tone =
    step.state === "done"
      ? "text-[hsl(var(--success))] border-[hsl(var(--success))] bg-success/10"
      : step.state === "active"
        ? "text-[hsl(var(--info))] border-[hsl(var(--info))] bg-info/10"
        : step.state === "problem"
          ? "text-destructive border-destructive bg-destructive/10"
          : "text-muted-foreground border-border bg-muted/30";

  const Icon = step.state === "problem" ? AlertCircle : step.state === "todo" ? Circle : step.icon;

  return (
    <div className="flex flex-col items-center min-w-[44px]" title={step.hint ? `${step.label} — ${step.hint}` : step.label}>
      <div className={cn("h-6 w-6 rounded-full border flex items-center justify-center", tone)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="text-[9px] text-muted-foreground mt-0.5 text-center leading-tight whitespace-nowrap">
        {step.label}
      </div>
    </div>
  );
}
