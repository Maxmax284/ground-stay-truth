/**
 * Maps AI assistant "SOURCES:" chip labels to a destination page,
 * a highlight key (data-ai-focus attribute), and a friendly label.
 */
export interface SourceTarget {
  route: string;          // pathname without query
  focusKey: string;       // matches data-ai-focus="<key>"
  label: string;          // tooltip text
}

export function resolveSourceTarget(source: string): SourceTarget | null {
  const s = source.toLowerCase();
  if (/platform guide|guidance|feature explainer|how do i|help center/.test(s))
    return { route: "/guidance-lab", focusKey: "guidance", label: "Open Platform Guide" };
  if (/payment|deposit|invoice|refund|stripe|charge|balance/.test(s))
    return { route: "/admin/payment-report", focusKey: "payments", label: "Open Payments" };
  if (/pickup|flight|airport|transport|driver|arrival transfer/.test(s))
    return { route: "/front-desk", focusKey: "pickups", label: "Open Front Desk · Pickups" };
  if (/document|passport|\bid\b|tm30|verification/.test(s))
    return { route: "/front-desk", focusKey: "documents", label: "Open Front Desk · Documents" };
  if (/housekeep|cleaning|turnover|laundry|maintenance/.test(s))
    return { route: "/front-desk", focusKey: "front-desk", label: "Open Front Desk" };
  if (/calendar|availability|unit|room|inventory/.test(s))
    return { route: "/calendar", focusKey: "calendar", label: "Open Calendar" };
  if (/message|whatsapp|line|telegram|inbox|chat/.test(s))
    return { route: "/messages", focusKey: "messages", label: "Open Messages" };
  if (/security|audit|compliance|gdpr|pdpa/.test(s))
    return { route: "/security-center", focusKey: "security", label: "Open Security Center" };
  if (/timeline|ops|control tower|narrative/.test(s))
    return { route: "/ops-control-tower", focusKey: "ops", label: "Open Ops Control Tower" };
  if (/booking|reservation|guest|focused/.test(s))
    return { route: "/bookings", focusKey: "bookings", label: "Open Bookings" };
  return null;
}

/** Build a shareable in-app path with the ai_focus (and optional booking) query params. */
export function buildSourcePath(target: SourceTarget, bookingId?: string | null): string {
  const params = new URLSearchParams();
  params.set("ai_focus", target.focusKey);
  if (bookingId) params.set("booking", bookingId);
  return `${target.route}?${params.toString()}`;
}

/** Build an absolute URL for sharing / new-tab open. */
export function buildSourceUrl(target: SourceTarget, bookingId?: string | null): string {
  const path = buildSourcePath(target, bookingId);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
