import { Eye, Banknote, Plane, IdCard, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BookingReadiness } from "@/hooks/useBookingReadiness";
import { cn } from "@/lib/utils";

/**
 * One-line guest readiness checklist for booking cards:
 * opened portal · paid · flight added · ID uploaded · messaged.
 * Purely informational — no actions, no alerts.
 */
export function BookingReadinessRow({ readiness }: { readiness?: BookingReadiness }) {
  const { t } = useTranslation();
  if (!readiness) return null;

  const items: Array<{ key: keyof BookingReadiness; icon: typeof Eye; label: string }> = [
    { key: "openedPortal", icon: Eye, label: t("readiness.openedPortal", "Opened portal") },
    { key: "paid", icon: Banknote, label: t("readiness.paid", "Paid") },
    { key: "flightAdded", icon: Plane, label: t("readiness.flightAdded", "Flight added") },
    { key: "idUploaded", icon: IdCard, label: t("readiness.idUploaded", "ID uploaded") },
    { key: "messaged", icon: MessageCircle, label: t("readiness.messaged", "Messaged") },
  ];

  return (
    <div className="mt-2 flex items-center gap-2.5" aria-label={t("readiness.label", "Guest readiness")}>
      {items.map(({ key, icon: Icon, label }) => {
        const done = readiness[key];
        return (
          <span
            key={key}
            title={`${label}: ${done ? t("readiness.yes", "yes") : t("readiness.no", "not yet")}`}
            aria-label={`${label}: ${done ? t("readiness.yes", "yes") : t("readiness.no", "not yet")}`}
            className={cn(
              "inline-flex items-center justify-center rounded-full h-5 w-5",
              done ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-muted-foreground/50 bg-muted/50",
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
        );
      })}
    </div>
  );
}
