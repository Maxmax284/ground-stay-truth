import { Network, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SystemNode {
  name: string;
  type: "critical" | "supporting" | "optional";
  dependencies: string[];
  description: string;
}

const systems: SystemNode[] = [
  {
    name: "React Frontend",
    type: "critical",
    dependencies: ["Lovable Cloud Backend", "Auth System"],
    description: "Client-side SPA — all user-facing UI",
  },
  {
    name: "Lovable Cloud Backend",
    type: "critical",
    dependencies: [],
    description: "Database, auth, storage, realtime",
  },
  {
    name: "Auth System",
    type: "critical",
    dependencies: ["Lovable Cloud Backend"],
    description: "User authentication, session management, JWT",
  },
  {
    name: "Edge Functions",
    type: "critical",
    dependencies: ["Lovable Cloud Backend"],
    description: "Server-side logic — payments, email, AI, flight tracking",
  },
  {
    name: "Stripe",
    type: "supporting",
    dependencies: ["Edge Functions"],
    description: "Payment processing — configured via Admin integration settings",
  },
  {
    name: "Built-in email engine",
    type: "supporting",
    dependencies: ["Edge Functions"],
    description: "Transactional email delivery via notify.lmtcampstay.com",
  },
  {
    name: "AviationStack",
    type: "optional",
    dependencies: ["Edge Functions"],
    description: "Live flight tracking for airport pickups",
  },
  {
    name: "Fenrir Lock",
    type: "optional",
    dependencies: ["Edge Functions"],
    description: "External cybersecurity monitoring",
  },
  {
    name: "Push Notifications",
    type: "supporting",
    dependencies: ["Edge Functions", "VAPID Keys"],
    description: "Web push via service worker",
  },
  {
    name: "File Storage",
    type: "supporting",
    dependencies: ["Lovable Cloud Backend"],
    description: "Unit photos, guest documents, maintenance photos",
  },
];

const typeColors: Record<string, string> = {
  critical: "text-red-600 border-red-300 bg-red-50",
  supporting: "text-amber-600 border-amber-300 bg-amber-50",
  optional: "text-muted-foreground border-border bg-muted/30",
};

export default function DRSInfraMap() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Network className="h-5 w-5" />
          Infrastructure Map
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connected services, dependencies, and criticality levels.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 bg-red-50">Critical</Badge>
        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">Supporting</Badge>
        <Badge variant="outline" className="text-[10px]">Optional</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {systems.map((sys) => (
          <Card key={sys.name}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">{sys.name}</p>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${typeColors[sys.type]}`}>
                  {sys.type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{sys.description}</p>
              {sys.dependencies.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Depends on: </span>
                  {sys.dependencies.join(", ")}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
