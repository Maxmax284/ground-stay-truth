import { useEffect, useState } from "react";
import { Mail, CreditCard, IdCard, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logGuestPortalEvent } from "@/lib/guestPortalTelemetry";

interface GuestEmailFallbackNoticeProps {
  /** Booking the shortcuts should act on (usually the guest's nearest stay). */
  bookingId?: string | null;
  /** Whether a deposit is still outstanding on that booking. */
  depositDue?: boolean;
}

/**
 * "Didn't get an email?" notice.
 *
 * Email is the one part of the chain we don't fully control (DNS, spam
 * filters, typo'd addresses). This tells guests plainly that the portal is
 * the source of truth and that they can pay and upload ID here right now,
 * without waiting for any message to arrive.
 */
export function GuestEmailFallbackNotice({ bookingId, depositDue }: GuestEmailFallbackNoticeProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    logGuestPortalEvent({
      event: "guest_email_fallback_notice_shown",
      status: "info",
      bookingId: bookingId ?? null,
      component: "GuestEmailFallbackNotice",
      message: "Guest opened the 'no email received' help panel",
    });
  }, [open, bookingId]);

  const focusBlock = (section: "deposit" | "documents") => {
    window.dispatchEvent(
      new CustomEvent("guest-portal-action", { detail: { tab: "bookings", section } }),
    );
    const attempt = (n = 0) => {
      const el = bookingId
        ? document.getElementById(`${section}-${bookingId}`) ??
          document.querySelector(`[data-${section}-section="${bookingId}"]`)
        : document.querySelector(`[data-${section}-section]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "rounded-md");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
      } else if (n < 12) {
        setTimeout(() => attempt(n + 1), 100);
      } else {
        toast.info("Open the Bookings tab — everything for your stay is there.");
      }
    };
    setTimeout(() => attempt(), 60);
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground flex-1">
          Haven't received a confirmation or payment email?
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Emails can be delayed or land in spam — you don't need one. This portal is the official record of your
            booking, and you can do everything here right now:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li>
              <span className="text-foreground font-medium">Pay your deposit:</span> open the Bookings tab and use the
              deposit box on your booking — it goes straight to our secure card page.
            </li>
            <li>
              <span className="text-foreground font-medium">Upload your ID / passport:</span> same booking card, the ID
              upload box just below.
            </li>
            <li>
              <span className="text-foreground font-medium">Download your confirmation:</span> the booking card has a PDF
              download, so you don't need the emailed copy.
            </li>
            <li>Check your spam/junk folder and, if your email address is wrong, update it in the Profile tab.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {depositDue && (
              <Button size="sm" className="gap-1.5" onClick={() => focusBlock("deposit")}>
                <CreditCard className="h-3.5 w-3.5" />
                Go to deposit
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => focusBlock("documents")}>
              <IdCard className="h-3.5 w-3.5" />
              Go to ID upload
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Still nothing after that? Message us from the Messages tab — we'll answer there, no email needed.
          </p>
        </div>
      )}
    </div>
  );
}
