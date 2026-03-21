import { Badge } from "@/components/ui/badge";
import { getAmenityIcon } from "@/lib/amenityIcons";
import { Sparkles } from "lucide-react";

interface AmenityBadgeProps {
  amenity: string;
  size?: "sm" | "xs";
}

export function AmenityBadge({ amenity, size = "xs" }: AmenityBadgeProps) {
  const Icon = getAmenityIcon(amenity) ?? Sparkles;
  const textSize = size === "sm" ? "text-xs" : "text-[10px]";

  return (
    <Badge variant="secondary" className={`${textSize} gap-1`}>
      <Icon className="h-3 w-3 shrink-0" />
      {amenity}
    </Badge>
  );
}

interface AmenityListProps {
  amenities: string[] | null | undefined;
  max?: number;
  size?: "sm" | "xs";
}

export function AmenityList({ amenities, max = 6, size = "xs" }: AmenityListProps) {
  if (!amenities || amenities.length === 0) return null;
  const shown = amenities.slice(0, max);
  const remaining = amenities.length - max;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((a) => (
        <AmenityBadge key={a} amenity={a} size={size} />
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className={`${size === "sm" ? "text-xs" : "text-[10px]"}`}>
          +{remaining}
        </Badge>
      )}
    </div>
  );
}
