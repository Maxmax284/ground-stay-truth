import { useTranslation } from "react-i18next";
import { useSearchParams, Navigate, useLocation } from "react-router-dom";
import { UserCheck, ClipboardCheck, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type FrontDeskView = "desk" | "checkin" | "arrivals";

export function useFrontDeskView(): FrontDeskView {
  const [params] = useSearchParams();
  const v = params.get("view");
  return v === "checkin" || v === "arrivals" ? v : "desk";
}

/** One Front Desk hub: Desk · Check-in · Arrivals board. */
export function FrontDeskSwitcher() {
  const { t } = useTranslation();
  const view = useFrontDeskView();
  const [, setParams] = useSearchParams();
  const items: { id: FrontDeskView; label: string; icon: typeof UserCheck }[] = [
    { id: "desk", label: t("nav.frontDesk", "Front Desk"), icon: UserCheck },
    { id: "checkin", label: t("nav.checkInDesk", "Check-in Desk"), icon: ClipboardCheck },
    { id: "arrivals", label: t("nav.arrivalsBoard", "Arrivals Board"), icon: LayoutDashboard },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1 w-full sm:w-fit">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setParams(id === "desk" ? {} : { view: id }, { replace: true })}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-300",
            view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  );
}

/** Old /check-in-desk and /arrivals-board links land on the matching Front Desk view. */
export function RedirectToFrontDesk({ view }: { view: FrontDeskView }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("view", view);
  return <Navigate to={`/front-desk?${params.toString()}`} replace />;
}
