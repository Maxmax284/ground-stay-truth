import {
  Wifi, Wind, UtensilsCrossed, Waves, Car, WashingMachine,
  Tv, Bath, Fence, PawPrint, Flame, Beef, Eye, TreePalm,
  Dumbbell, Shield, Droplets, Lock, Zap, LucideIcon
} from "lucide-react";

/**
 * Maps known amenity names (case-insensitive) to Lucide icons.
 * Falls back to null for custom/unknown amenities.
 */
const AMENITY_MAP: Record<string, LucideIcon> = {
  wifi: Wifi,
  "air conditioning": Wind,
  ac: Wind,
  kitchen: UtensilsCrossed,
  pool: Waves,
  parking: Car,
  "washer/dryer": WashingMachine,
  washer: WashingMachine,
  dryer: WashingMachine,
  tv: Tv,
  "hot tub": Bath,
  balcony: Fence,
  "pet friendly": PawPrint,
  fireplace: Flame,
  "bbq grill": Beef,
  "ocean view": Eye,
  "sea view": Eye,
  garden: TreePalm,
  gym: Dumbbell,
  safe: Lock,
  security: Shield,
  "rain shower": Droplets,
  electricity: Zap,
};

export function getAmenityIcon(amenity: string): LucideIcon | null {
  return AMENITY_MAP[amenity.toLowerCase()] ?? null;
}
