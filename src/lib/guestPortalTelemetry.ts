/**
 * Guest portal telemetry.
 *
 * Answers exactly one operational question: "did the guest get stuck, and
 * where?" Every event lands in `public.guest_portal_activity`, which staff
 * read from Operations Monitor → Guest Portal Health.
 *
 * Privacy rules (non-negotiable):
 *   - No secrets, no tokens, no checkout URLs, no card data.
 *   - No document contents, no file bytes — filenames/sizes only.
 *   - Nothing beyond what staff can already see on the booking.
 *
 * Logging is fire-and-forget. It must never throw, never block a click, and
 * never be the reason a payment button feels slow.
 */
import { supabase } from "@/integrations/supabase/client";

export type GuestPortalEvent =
  // access
  | "guest_login_started"
  | "guest_login_success"
  | "guest_login_failed"
  | "guest_portal_loaded"
  | "guest_portal_load_failed"
  | "guest_booking_loaded"
  | "guest_booking_missing"
  // booking status
  | "guest_viewed_booking"
  // payment funnel
  | "deposit_button_clicked"
  | "deposit_section_scrolled"
  | "checkout_button_clicked"
  | "checkout_create_started"
  | "checkout_create_success"
  | "checkout_create_failed"
  | "checkout_redirect_started"
  | "checkout_timeout"
  // id upload
  | "id_upload_button_clicked"
  | "id_upload_section_scrolled"
  | "id_upload_started"
  | "id_upload_success"
  | "id_upload_failed"
  | "id_upload_validation_failed"
  // client health
  | "guest_client_error"
  | "guest_react_error_boundary"
  | "guest_network_error"
  | "guest_in_app_browser_detected"
  | "guest_email_fallback_notice_shown";

export type EventStatus = "ok" | "info" | "warn" | "fail";
export type Severity = "info" | "warning" | "error";

interface LogParams {
  event: GuestPortalEvent;
  status?: EventStatus;
  severity?: Severity;
  bookingId?: string | null;
  component?: string;
  action?: string;
  message?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

/** Events that should surface as "needs attention" in Operations Monitor. */
export const FAILURE_EVENTS: GuestPortalEvent[] = [
  "checkout_create_failed",
  "checkout_timeout",
  "guest_portal_load_failed",
  "id_upload_failed",
  "guest_client_error",
  "guest_react_error_boundary",
  "guest_network_error",
  "guest_login_failed",
];

// ---------------------------------------------------------------------------
// Browser / device fingerprint (coarse, non-identifying)
// ---------------------------------------------------------------------------

export interface BrowserInfo {
  userAgent: string;
  deviceType: "mobile" | "tablet" | "desktop";
  browserName: string;
  osName: string;
  isInAppBrowser: boolean;
  inAppLabel: string;
}

const IN_APP_MATCHERS: Array<[RegExp, string]> = [
  [/fbav|fb_iab|fban|fbios/, "Facebook"],
  [/messenger/, "Messenger"],
  [/instagram/, "Instagram"],
  [/tiktok|bytedance|musical_ly/, "TikTok"],
  [/line\//, "LINE"],
  [/whatsapp/, "WhatsApp"],
  [/telegram/, "Telegram"],
  [/snapchat/, "Snapchat"],
  [/twitter/, "X / Twitter"],
  [/; wv\)|webview/, "In-app browser"],
];

/** Detect common in-app browsers. Safe, coarse, UA-string only. */
export function detectInAppBrowser(): { isInApp: boolean; label: string } {
  if (typeof navigator === "undefined") return { isInApp: false, label: "" };
  const ua = (navigator.userAgent || (navigator as any).vendor || "").toLowerCase();
  for (const [re, label] of IN_APP_MATCHERS) {
    if (re.test(ua)) return { isInApp: true, label };
  }
  return { isInApp: false, label: "" };
}

export function getBrowserInfo(): BrowserInfo {
  if (typeof navigator === "undefined") {
    return {
      userAgent: "",
      deviceType: "desktop",
      browserName: "unknown",
      osName: "unknown",
      isInAppBrowser: false,
      inAppLabel: "",
    };
  }
  const ua = navigator.userAgent || "";
  const lower = ua.toLowerCase();

  const deviceType: BrowserInfo["deviceType"] = /ipad|tablet/.test(lower)
    ? "tablet"
    : /mobi|android|iphone|ipod/.test(lower)
      ? "mobile"
      : "desktop";

  const browserName = /edg\//.test(lower)
    ? "Edge"
    : /opr\/|opera/.test(lower)
      ? "Opera"
      : /chrome|crios/.test(lower)
        ? "Chrome"
        : /firefox|fxios/.test(lower)
          ? "Firefox"
          : /safari/.test(lower)
            ? "Safari"
            : "Other";

  const osName = /iphone|ipad|ipod|ios/.test(lower)
    ? "iOS"
    : /android/.test(lower)
      ? "Android"
      : /mac os/.test(lower)
        ? "macOS"
        : /windows/.test(lower)
          ? "Windows"
          : /linux/.test(lower)
            ? "Linux"
            : "Other";

  const inApp = detectInAppBrowser();

  return {
    userAgent: ua.slice(0, 400),
    deviceType,
    browserName,
    osName,
    isInAppBrowser: inApp.isInApp,
    inAppLabel: inApp.label,
  };
}

// ---------------------------------------------------------------------------
// Session id — random per tab, not tied to identity
// ---------------------------------------------------------------------------

const SESSION_KEY = "gp_session_id";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no_session";
  }
}

// Cheap de-dupe so a re-render storm can't spam identical rows.
const recent = new Map<string, number>();
const DEDUPE_MS = 4000;

/** Fire-and-forget portal event log. Never throws. */
export function logGuestPortalEvent(params: LogParams): void {
  void (async () => {
    try {
      const key = `${params.event}:${params.bookingId ?? ""}:${params.errorCode ?? ""}`;
      const now = Date.now();
      const last = recent.get(key);
      if (last && now - last < DEDUPE_MS) return;
      recent.set(key, now);

      const info = getBrowserInfo();
      const { data } = await supabase.auth.getUser();
      const guestId = data?.user?.id ?? null;

      await supabase.from("guest_portal_activity").insert({
        guest_id: guestId,
        booking_id: params.bookingId ?? null,
        event_type: params.event,
        event_status: params.status ?? (FAILURE_EVENTS.includes(params.event) ? "fail" : "info"),
        severity:
          params.severity ?? (FAILURE_EVENTS.includes(params.event) ? "error" : "info"),
        source: "guest_portal",
        route: typeof window !== "undefined" ? window.location.pathname.slice(0, 200) : null,
        component: params.component ?? null,
        action: params.action ?? null,
        message: params.message?.slice(0, 500) ?? null,
        error_code: params.errorCode?.slice(0, 120) ?? null,
        error_message: params.errorMessage?.slice(0, 500) ?? null,
        metadata: {
          ...(params.metadata ?? {}),
          ...(info.inAppLabel ? { in_app_label: info.inAppLabel } : {}),
        },
        user_agent: info.userAgent,
        device_type: info.deviceType,
        browser_name: info.browserName,
        os_name: info.osName,
        is_in_app_browser: info.isInAppBrowser,
        session_id: getSessionId(),
      });
    } catch {
      // Telemetry must never break the guest flow.
    }
  })();
}
