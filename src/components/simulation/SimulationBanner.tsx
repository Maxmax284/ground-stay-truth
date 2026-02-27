import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimulation } from "./SimulationContext";
import type { AppRole } from "@/lib/permissions";

const ALL_ROLES: AppRole[] = ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer", "guest"];

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  front_desk_supervisor: "Supervisor",
  front_desk: "Front Desk",
  maintenance: "Maintenance",
  viewer: "Viewer",
  guest: "Guest",
};

export function SimulationBanner() {
  const { simulatedRole, setSimulatedRole } = useSimulation();

  return (
    <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-sm font-semibold text-destructive">SIMULATION MODE</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          — Mock data only. No real actions.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Viewing as:</span>
        <Select
          value={simulatedRole}
          onValueChange={(val) => setSimulatedRole(val as AppRole)}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
