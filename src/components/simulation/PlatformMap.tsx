import { useState } from "react";
import { Shield, Eye, Wrench, Headset, UserCheck, Crown, User, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/permissions";
import { useSimulation } from "./SimulationContext";

interface RoleInfo {
  role: AppRole;
  label: string;
  icon: React.ReactNode;
  tier: number;
  pages: string[];
  actions: string[];
  aiCapabilities: string[];
}

const ROLE_DATA: RoleInfo[] = [
  {
    role: "admin",
    label: "Admin",
    icon: <Crown className="h-4 w-4" />,
    tier: 6,
    pages: ["Dashboard", "Units", "Bookings", "Calendar", "Pricing", "Reports", "Messages", "Embeds", "Settings"],
    actions: ["Full system control", "Admin state override", "Create staff accounts", "Manage roles & policies", "Approve bookings", "Manage reviews"],
    aiCapabilities: ["System health queries", "Staff activity reports", "Revenue analytics", "Policy summaries"],
  },
  {
    role: "manager",
    label: "Manager",
    icon: <Shield className="h-4 w-4" />,
    tier: 5,
    pages: ["Dashboard", "Units", "Bookings", "Calendar", "Pricing", "Reports", "Messages", "Embeds", "Settings"],
    actions: ["Approve/reject bookings", "Manage units & pricing", "Record payments", "Manage maintenance blocks", "Override deposit rules"],
    aiCapabilities: ["Revenue summaries", "Occupancy trends", "Booking pipeline", "Payment reports"],
  },
  {
    role: "front_desk_supervisor",
    label: "Supervisor",
    icon: <UserCheck className="h-4 w-4" />,
    tier: 4,
    pages: ["Dashboard", "Bookings", "Calendar", "Messages", "Settings"],
    actions: ["Complete check-in/check-out", "Record deposit payments", "Manage bookings", "Upload documents"],
    aiCapabilities: ["Today's schedule", "Deposit status", "Guest histories", "Availability checks"],
  },
  {
    role: "front_desk",
    label: "Front Desk",
    icon: <Headset className="h-4 w-4" />,
    tier: 3,
    pages: ["Dashboard", "Bookings", "Calendar", "Messages", "Settings"],
    actions: ["Create inquiries", "Transition booking states", "Send messages", "Upload documents"],
    aiCapabilities: ["Arrivals/departures", "Booking lookups", "Draft messages", "Availability checks"],
  },
  {
    role: "maintenance",
    label: "Maintenance",
    icon: <Wrench className="h-4 w-4" />,
    tier: 2,
    pages: ["Dashboard", "Calendar"],
    actions: ["Resolve maintenance requests", "Update task statuses", "View calendar for scheduling"],
    aiCapabilities: ["Maintenance queue", "Overdue requests", "Unit status", "Scheduling info"],
  },
  {
    role: "viewer",
    label: "Viewer",
    icon: <Eye className="h-4 w-4" />,
    tier: 1,
    pages: ["Dashboard", "Bookings", "Calendar", "Reports"],
    actions: ["Read-only access to all visible data", "Monitor trends", "No create/edit/delete"],
    aiCapabilities: ["Occupancy trends", "Booking statistics", "Report summaries"],
  },
  {
    role: "guest",
    label: "Guest",
    icon: <User className="h-4 w-4" />,
    tier: 0,
    pages: ["Guest Portal"],
    actions: ["Request bookings", "Upload ID", "Message staff", "Report issues", "Request laundry", "Leave reviews"],
    aiCapabilities: ["Booking details", "Pricing & availability", "Camp schedules", "Pre-arrival checklist"],
  },
];

const ALL_PAGES = ["Dashboard", "Units", "Bookings", "Calendar", "Pricing", "Reports", "Messages", "Embeds", "Settings", "Guest Portal"];

function RoleCard({ info, isActive, onClick }: { info: RoleInfo; isActive: boolean; onClick: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 border-2",
          isActive
            ? "border-primary bg-primary/5 shadow-md"
            : "border-transparent hover:border-border hover:shadow-sm"
        )}
        onClick={onClick}
      >
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div className={cn(
                "p-1.5 rounded-md",
                isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {info.icon}
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">{info.label}</CardTitle>
                <p className="text-xs text-muted-foreground">Tier {info.tier}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{info.pages.length} pages</Badge>
              {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Actions</p>
              <ul className="space-y-0.5">
                {info.actions.map((a) => (
                  <li key={a} className="text-xs flex items-start gap-1.5">
                    <Check className="h-3 w-3 text-success mt-0.5 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Kru Glitch AI</p>
              <ul className="space-y-0.5">
                {info.aiCapabilities.map((c) => (
                  <li key={c} className="text-xs flex items-start gap-1.5">
                    <Check className="h-3 w-3 text-info mt-0.5 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function PlatformMap() {
  const { simulatedRole, setSimulatedRole } = useSimulation();
  const [selectedRole, setSelectedRole] = useState<AppRole>(simulatedRole);

  const handleSelect = (role: AppRole) => {
    setSelectedRole(role);
    setSimulatedRole(role);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Role Hierarchy */}
      <div className="lg:col-span-1 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Role Hierarchy
        </h3>
        {ROLE_DATA.map((info) => (
          <RoleCard
            key={info.role}
            info={info}
            isActive={selectedRole === info.role}
            onClick={() => handleSelect(info.role)}
          />
        ))}
      </div>

      {/* Feature Matrix */}
      <div className="lg:col-span-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Feature Access Matrix
        </h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card z-10">Page</th>
                    {ROLE_DATA.map((r) => (
                      <th
                        key={r.role}
                        className={cn(
                          "p-3 font-medium text-center min-w-[70px]",
                          selectedRole === r.role ? "bg-primary/10 text-primary" : "text-muted-foreground"
                        )}
                      >
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PAGES.map((page) => (
                    <tr key={page} className="border-b border-border/50 last:border-0">
                      <td className="p-3 font-medium sticky left-0 bg-card z-10">{page}</td>
                      {ROLE_DATA.map((r) => {
                        const hasAccess = r.pages.includes(page);
                        return (
                          <td
                            key={r.role}
                            className={cn(
                              "p-3 text-center",
                              selectedRole === r.role ? "bg-primary/5" : ""
                            )}
                          >
                            {hasAccess ? (
                              <Check className="h-4 w-4 text-success mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
