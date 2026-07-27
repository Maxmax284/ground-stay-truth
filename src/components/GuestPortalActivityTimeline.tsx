/**
 * Guest Portal Activity — staff-only timeline for a single booking.
 *
 * Shows what the guest actually did in the portal (opened it, tapped Pay
 * Deposit, reached Stripe, uploaded ID, hit an error) so front desk can answer
 * "have they even tried to pay?" without guessing.
 *
 * Read-only. RLS restricts `guest_portal_activity` SELECT to staff.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const PLAIN_ENGLISH: Record<string, string> = {
  guest_portal_loaded: "Opened the portal",
  guest_portal_load_failed: "Portal failed to load their bookings",
  guest_booking_loaded: "Saw their booking",
  guest_booking_missing: "Logged in with no booking linked",
  guest_viewed_booking: "Viewed this booking",
  deposit_button_clicked: "Tapped Pay Deposit",
  deposit_section_scrolled: "Reached the deposit section",
  checkout_button_clicked: "Tapped Pay Deposit Online",
  checkout_create_started: "Checkout being created",
  checkout_create_success: "Checkout created",
  checkout_create_failed: "Checkout failed",
  checkout_redirect_started: "Sent to Stripe",
  checkout_redirect_stalled: "Stripe page never opened (stalled)",
  checkout_timeout: "Checkout timed out",
  id_upload_button_clicked: "Tapped Upload ID",
  id_upload_section_scrolled: "Reached the ID upload box",
  id_upload_started: "Started uploading ID",
  id_upload_success: "Uploaded ID",
  id_upload_failed: "ID upload failed",
  id_upload_stalled: "ID upload stalled",
  id_upload_validation_failed: "ID file rejected (type or size)",
  guest_in_app_browser_detected: "Opened inside an in-app browser",
  guest_network_error: "Network error in the portal",
  guest_client_error: "App error in the portal",
  guest_react_error_boundary: "Portal crashed on their screen",
  guest_email_fallback_notice_shown: "Opened the 'no email received' help",
  guest_login_failed: "Login failed",
};

const BAD = new Set([
  "checkout_create_failed",
  "checkout_timeout",
  "checkout_redirect_stalled",
  "guest_portal_load_failed",
  "id_upload_failed",
  "id_upload_stalled",
  "id_upload_validation_failed",
  "guest_client_error",
  "guest_react_error_boundary",
  "guest_network_error",
  "guest_login_failed",
]);

interface Props {
  bookingId: string;
}

export function GuestPortalActivityTimeline({ bookingId }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["booking-portal-activity", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_portal_activity")
        .select("id, created_at, event_type, event_status, severity, message, error_code, error_message, device_type, browser_name, os_name, is_in_app_browser")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (data ?? []) as any[];

  return (
    <div className="py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" />
          Guest portal activity
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        What this guest did in their portal — last 40 events. Staff-only, never shown to the guest.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Portal activity isn't visible for your role.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No portal activity recorded for this booking yet — the guest may not have signed in.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const bad = BAD.has(r.event_type) || r.severity === "error";
            return (
              <div key={r.id} className="rounded-md border p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className={`font-medium ${bad ? "text-rose-600 dark:text-rose-400" : r.severity === "warning" ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {PLAIN_ENGLISH[r.event_type] ?? r.event_type}
                  </span>
                  <span className="text-muted-foreground shrink-0" title={format(new Date(r.created_at), "PPpp")}>
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
                {(r.error_message || r.message) && (
                  <p className="text-muted-foreground mt-1 break-words">{r.error_message ?? r.message}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {r.device_type ?? "?"} · {r.browser_name ?? "?"} · {r.os_name ?? "?"}
                  </Badge>
                  {r.is_in_app_browser && (
                    <Badge variant="outline" className="text-[10px] text-amber-600">
                      in-app browser
                    </Badge>
                  )}
                  {r.error_code && (
                    <Badge variant="outline" className="text-[10px]">{r.error_code}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
