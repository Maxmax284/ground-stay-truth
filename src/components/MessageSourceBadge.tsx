import { MessageCircle, Monitor, Send, Smartphone, Mail } from "lucide-react";

/**
 * Where a message came from. One conversation per guest, whichever app they
 * wrote from — this is the only thing that tells staff which one that was.
 * Portal messages stay unlabelled: that's the default and labelling it adds noise.
 */
const SOURCES: Record<string, { label: string; icon: typeof MessageCircle; className: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, className: "text-emerald-600 dark:text-emerald-400" },
  telegram: { label: "Telegram", icon: Send, className: "text-sky-600 dark:text-sky-400" },
  sms: { label: "SMS", icon: Smartphone, className: "text-muted-foreground" },
  line: { label: "LINE", icon: MessageCircle, className: "text-green-600 dark:text-green-400" },
  email: { label: "Email", icon: Mail, className: "text-muted-foreground" },
  portal: { label: "Portal", icon: Monitor, className: "text-muted-foreground" },
};

interface MessageSourceBadgeProps {
  source?: string | null;
  /** Show the badge for portal messages too (used in the inbox list). */
  showPortal?: boolean;
  className?: string;
}

export function MessageSourceBadge({ source, showPortal = false, className }: MessageSourceBadgeProps) {
  const key = (source ?? "portal").toLowerCase();
  if (key === "portal" && !showPortal) return null;
  const entry = SOURCES[key];
  if (!entry) return null;
  const Icon = entry.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${entry.className} ${className ?? ""}`}
      title={`Sent via ${entry.label}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {entry.label}
    </span>
  );
}

export default MessageSourceBadge;
