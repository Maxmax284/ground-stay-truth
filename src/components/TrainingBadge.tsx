import { Badge } from "@/components/ui/badge";
import { Swords } from "lucide-react";

interface TrainingBadgeProps {
  className?: string;
}

/**
 * Visual badge indicating training is included with a booking or unit.
 * Uses the Swords icon (closest to boxing/combat in Lucide).
 */
export function TrainingBadge({ className }: TrainingBadgeProps) {
  return (
    <Badge className={`gap-1 bg-fight-gold text-fight-dark hover:bg-fight-gold/90 ${className ?? ""}`}>
      <Swords className="h-3 w-3" />
      Training Included
    </Badge>
  );
}
