import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuestThreadDialog } from "@/components/GuestThreadDialog";
import { useMarkMessagesRead } from "@/hooks/useBookings";

interface GuestThreadLauncherProps {
  bookingId: string;
  guestName?: string | null;
  headline?: string;
  /** Custom trigger (e.g. the last-message snapshot on a card). */
  trigger?: ReactNode;
  className?: string;
  onOpenBooking?: () => void;
}

/**
 * Drops a guest's own conversation straight onto whatever card staff are already
 * looking at. Owns its own dialog state so no page has to thread props through
 * nested card components, and stops the click from bubbling into the card's
 * "open booking" handler.
 */
export function GuestThreadLauncher({
  bookingId,
  guestName,
  headline,
  trigger,
  className,
  onOpenBooking,
}: GuestThreadLauncherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const markRead = useMarkMessagesRead();

  const launch = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setOpen(true);
    markRead.mutate(bookingId);
  };

  return (
    <>
      {trigger ? (
        <div
          role="button"
          tabIndex={0}
          className={className}
          onClick={launch}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              launch(e);
            }
          }}
        >
          {trigger}
        </div>
      ) : (
        <Button size="sm" variant="outline" className={className ?? "h-8 text-xs gap-1"} onClick={launch}>
          <MessageSquare className="h-3.5 w-3.5" />
          {t("messages.openChat", "Chat")}
        </Button>
      )}

      <GuestThreadDialog
        bookingId={open ? bookingId : null}
        open={open}
        onOpenChange={setOpen}
        headline={headline}
        guestName={guestName}
        onOpenBooking={
          onOpenBooking
            ? () => {
                setOpen(false);
                onOpenBooking();
              }
            : undefined
        }
      />
    </>
  );
}

export default GuestThreadLauncher;
