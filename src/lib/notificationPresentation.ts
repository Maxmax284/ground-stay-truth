export type NotificationAudience = "stay" | "ops" | "owner" | "engine";
export type NotificationLevel = "urgent" | "important" | "digest" | "silent";

type NotificationPresentation = {
  icon: string;
  label: string;
  audience: NotificationAudience;
  level: NotificationLevel;
};

const DEFAULT_PRESENTATION: NotificationPresentation = {
  icon: "📌",
  label: "Notice",
  audience: "ops",
  level: "important",
};

const PRESENTATION: Record<string, NotificationPresentation> = {
  booking: { icon: "📋", label: "Booking", audience: "ops", level: "important" },
  payment: { icon: "💳", label: "Payment", audience: "owner", level: "important" },
  maintenance: { icon: "🔧", label: "Maintenance", audience: "ops", level: "important" },
  laundry: { icon: "👕", label: "Laundry", audience: "ops", level: "digest" },
  override: { icon: "⚠️", label: "Override", audience: "owner", level: "urgent" },
  stay_essentials: { icon: "🏠", label: "Stay info", audience: "stay", level: "digest" },
  daily_digest: { icon: "📊", label: "Daily brief", audience: "owner", level: "digest" },
  security_freeze: { icon: "🚨", label: "Security freeze", audience: "engine", level: "urgent" },
  security_unfreeze: { icon: "✅", label: "Security restored", audience: "engine", level: "important" },
  flight: { icon: "✈️", label: "Flight", audience: "ops", level: "important" },
  flight_landed: { icon: "✈️", label: "Flight status", audience: "ops", level: "important" },
  guest_landed: { icon: "🛬", label: "Guest signal", audience: "ops", level: "important" },
  pickup_confirmed: { icon: "🚗", label: "Pickup", audience: "ops", level: "important" },
  message: { icon: "💬", label: "Message", audience: "ops", level: "important" },
  review: { icon: "⭐", label: "Review", audience: "owner", level: "digest" },
  test: { icon: "🔔", label: "Test", audience: "engine", level: "silent" },
  welcome: { icon: "🔔", label: "Stay update", audience: "stay", level: "digest" },
};

export const NOTIFICATION_AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  stay: "Stay",
  ops: "Ops",
  owner: "Owner",
  engine: "Engine",
};

export const NOTIFICATION_LEVEL_LABELS: Record<NotificationLevel, string> = {
  urgent: "Urgent",
  important: "Important",
  digest: "Digest",
  silent: "Silent log",
};

export function getNotificationPresentation(type: string): NotificationPresentation {
  return PRESENTATION[type] ?? { ...DEFAULT_PRESENTATION, label: type.replaceAll("_", " ") };
}