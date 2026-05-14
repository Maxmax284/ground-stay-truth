// Floating "Contact Front Desk" button for guests.
// Always visible across guest screens. On /guest, dispatches the portal
// action event to switch to the Messages tab. Otherwise navigates there.

import { useLocation, useNavigate } from "react-router-dom";
import { LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";

export function FrontDeskFAB() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const onClick = () => {
    if (location.pathname.startsWith("/guest")) {
      window.dispatchEvent(
        new CustomEvent("guest-portal-action", { detail: { tab: "messages" } })
      );
    } else {
      navigate("/guest");
      // Defer until portal mounts
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("guest-portal-action", { detail: { tab: "messages" } })
        );
      }, 250);
    }
  };

  return (
    <button
      onClick={onClick}
      aria-label={t("guestPortal.contactFrontDesk", { defaultValue: "Contact Front Desk" })}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-3 shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform duration-200"
    >
      <LifeBuoy className="h-5 w-5" />
      <span className="text-sm font-semibold hidden sm:inline">
        {t("guestPortal.frontDesk", { defaultValue: "Front Desk" })}
      </span>
    </button>
  );
}
