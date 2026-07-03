import { Wifi, Users, AlertTriangle, Coins, PlaneTakeoff, ClipboardList, HelpCircle, FileText, ListChecks, MessageSquare, Compass, BookOpen, Wrench, MapPin } from "lucide-react";

export interface QuickPrompt {
  icon: React.ReactNode;
  label: string;
  prompt: string;
}

/** Universal help prompts — grounded in platform_guidance. Shown to all staff roles. */
const HELP_PROMPTS: QuickPrompt[] = [
  { icon: <Compass className="h-3 w-3" />, label: "Explain this page", prompt: "Explain what this page is for and what I can do here. Use the approved Platform Guide." },
  { icon: <BookOpen className="h-3 w-3" />, label: "What is this feature?", prompt: "What is this feature for? Give me the short version from the Platform Guide." },
  { icon: <Wrench className="h-3 w-3" />, label: "Troubleshoot this", prompt: "Something on this page isn't behaving the way I expect. Walk me through the checks from the Platform Guide — what to verify, in what order, and what each result means. Do not invent steps." },
  { icon: <MapPin className="h-3 w-3" />, label: "Where do I…", prompt: "Where in the platform do I go to do this? Point me to the right page." },
];

const STAFF_PROMPTS: QuickPrompt[] = [
  ...HELP_PROMPTS,
  { icon: <Users className="h-3 w-3" />, label: "Who needs attention today?", prompt: "Who needs attention today?" },
  { icon: <ClipboardList className="h-3 w-3" />, label: "Summarize today's arrivals", prompt: "Summarize today's arrivals." },
  { icon: <AlertTriangle className="h-3 w-3" />, label: "Explain unresolved alerts", prompt: "Explain the unresolved alerts and what they mean for operations." },
  { icon: <Coins className="h-3 w-3" />, label: "Draft a deposit reminder", prompt: "Draft a friendly deposit reminder message I can send to a guest." },
  { icon: <PlaneTakeoff className="h-3 w-3" />, label: "Bookings missing flight details", prompt: "Show me bookings missing flight or arrival details." },
  { icon: <MapPin className="h-3 w-3" />, label: "Lost guest assist", prompt: "A guest is lost or confused about how to reach the property. Using only approved Platform Guide entries, draft directions I can send them. If we don't have approved directions yet, say so and don't invent any." },
];

const ADMIN_PROMPTS: QuickPrompt[] = [
  ...STAFF_PROMPTS,
  { icon: <HelpCircle className="h-3 w-3" />, label: "System health snapshot", prompt: "Give me a quick system health snapshot for the last 7 days." },
];

const GUEST_PROMPTS: QuickPrompt[] = [
  { icon: <Wifi className="h-3 w-3" />, label: "Stay essentials", prompt: "Show me my stay essentials — WiFi password, house rules, and emergency contacts." },
  { icon: <ClipboardList className="h-3 w-3" />, label: "My booking status", prompt: "What's the status of my booking and what do I still need to do before arrival?" },
  { icon: <PlaneTakeoff className="h-3 w-3" />, label: "Airport pickup info", prompt: "Do I have an airport pickup arranged? What are the details?" },
];

/** Phase 5: booking-focused quick prompts shown when a booking sheet is open. */
export const FOCUSED_BOOKING_PROMPTS: QuickPrompt[] = [
  { icon: <FileText className="h-3 w-3" />, label: "Summarize this booking", prompt: "Summarize this booking — dates, guest, payment status, and anything that needs attention." },
  { icon: <ListChecks className="h-3 w-3" />, label: "What's missing here?", prompt: "What's missing on this booking that would block a smooth check-in?" },
  { icon: <Coins className="h-3 w-3" />, label: "Draft a deposit reminder", prompt: "Draft a friendly deposit reminder message for this guest." },
  { icon: <MessageSquare className="h-3 w-3" />, label: "Draft an arrival welcome", prompt: "Draft a warm arrival welcome message for this guest with the key info they need." },
  { icon: <PlaneTakeoff className="h-3 w-3" />, label: "Pickup status", prompt: "What's the airport pickup status for this booking and any gaps?" },
];

export function getQuickPromptsForRole(role: string | null | undefined): QuickPrompt[] {
  if (role === "admin") return ADMIN_PROMPTS;
  if (role === "guest") return GUEST_PROMPTS;
  if (!role) return [];
  return STAFF_PROMPTS;
}

