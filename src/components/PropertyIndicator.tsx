import { useProperty } from "@/hooks/useProperty";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const PROPERTY_COLORS: Record<string, string> = {
  lamai: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  "koh-shanti": "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800",
};

const PROPERTY_DOT_COLORS: Record<string, string> = {
  lamai: "bg-red-500",
  "koh-shanti": "bg-teal-500",
};

export function PropertyIndicator() {
  const { activeProperty, properties, switchProperty, isUmbrella, isLoading } = useProperty();

  if (isLoading || !activeProperty) return null;

  const colorClass = PROPERTY_COLORS[activeProperty.slug] ?? "bg-muted text-muted-foreground";
  const dotColor = PROPERTY_DOT_COLORS[activeProperty.slug] ?? "bg-muted-foreground";

  // Single-property users: static badge
  if (!isUmbrella) {
    return (
      <Badge variant="outline" className={`text-xs gap-1.5 ${colorClass}`}>
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        {activeProperty.name}
      </Badge>
    );
  }

  // Umbrella users: dropdown to switch
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`h-7 text-xs gap-1.5 ${colorClass}`}>
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          {activeProperty.name}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {properties.map((p) => {
          const pDot = PROPERTY_DOT_COLORS[p.slug] ?? "bg-muted-foreground";
          const isActive = p.id === activeProperty.id;
          return (
            <DropdownMenuItem
              key={p.id}
              onClick={() => switchProperty(p.id)}
              className={isActive ? "bg-accent" : ""}
            >
              <span className={`h-2 w-2 rounded-full ${pDot} mr-2`} />
              <span className="flex-1">{p.name}</span>
              {isActive && <span className="text-xs text-muted-foreground ml-2">Active</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
