// Floating "Contact Front Desk" button for guests.
// Always visible across guest screens. Shows unread badge + latest staff
// message preview when staff has replied. On /guest, dispatches the portal
// action event to switch to the Messages tab. Otherwise navigates there.

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LifeBuoy, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGuestInboxSummary } from "@/hooks/useGuestInboxSummary";
import { formatDistanceToNow } from "date-fns";

export function FrontDeskFAB() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { data } = useGuestInboxSummary();
  const [showPreview, setShowPreview] = useState(true);

  const unread = data?.unread ?? 0;
  const last = data?.lastFromStaff ?? null;
  const hasPreview = unread > 0 && !!last && showPreview;

  const goToMessages = () => {
    if (location.pathname.startsWith("/guest")) {
      window.dispatchEvent(
        new CustomEvent("guest-portal-action", { detail: { tab: "messages" } })
      );
    } else {
      navigate("/guest");
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("guest-portal-action", { detail: { tab: "messages" } })
        );
      }, 250);
    }
  };

  return (
    <div className="guest-frontdesk-dock fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 sm:bottom-5 sm:right-5 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
      {hasPreview && (
        <div className="max-w-[min(280px,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-card shadow-lg shadow-primary/10 p-3 pr-8 relative animate-fade-in">
          <button
            onClick={(e) => { e.stopPropagation(); setShowPreview(false); }}
            className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
          <button onClick={goToMessages} className="text-left w-full">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-primary mb-1">
              {t("guestPortal.frontDeskReplied", { defaultValue: "Front Desk replied" })}
              {" · "}
              {formatDistanceToNow(new Date(last!.created_at), { addSuffix: true })}
            </div>
            <p className="text-xs text-foreground line-clamp-2 break-anywhere">{last!.content || t("messages.noContent", { defaultValue: "(no preview)" })}</p>
          </button>
        </div>
      )}

      <button
        onClick={goToMessages}
        aria-label={t("guestPortal.contactFrontDesk", { defaultValue: "Contact Front Desk" })}
        className="relative flex items-center gap-2 rounded-full bg-primary text-primary-foreground p-3 sm:px-4 shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform duration-200"
      >
        <LifeBuoy className="h-5 w-5" />
        <span className="text-sm font-semibold hidden sm:inline">
          {t("guestPortal.frontDesk", { defaultValue: "Front Desk" })}
        </span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center border-2 border-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
