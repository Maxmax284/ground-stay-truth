import { Wifi, Users, AlertTriangle, Coins, PlaneTakeoff, ClipboardList, HelpCircle } from "lucide-react";

export interface QuickPrompt {
  icon: React.ReactNode;
  label: string;
  prompt: string;
}

const STAFF_PROMPTS: QuickPrompt[] = [
  { icon: <Users className="h-3 w-3" />, label: "Who needs attention today?", prompt: "Who needs attention today?" },
  { icon: <ClipboardList className="h-3 w-3" />, label: "Summarize today's arrivals", prompt: "Summarize today's arrivals." },
  { icon: <AlertTriangle className="h-3 w-3" />, label: "Explain unresolved alerts", prompt: "Explain the unresolved alerts and what they mean for operations." },
  { icon: <Coins className="h-3 w-3" />, label: "Draft a deposit reminder", prompt: "Draft a friendly deposit reminder message I can send to a guest." },
  { icon: <PlaneTakeoff className="h-3 w-3" />, label: "Bookings missing flight details", prompt: "Show me bookings missing flight or arrival details." },
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

export function getQuickPromptsForRole(role: string | null | undefined): QuickPrompt[] {
  if (role === "admin") return ADMIN_PROMPTS;
  if (role === "guest") return GUEST_PROMPTS;
  if (!role) return [];
  return STAFF_PROMPTS;
}
