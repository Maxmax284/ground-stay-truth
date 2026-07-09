/**
 * Maps LMT CampStay internal roles to Fenrir Lock role identifiers.
 */
import type { AppRole } from "@/lib/permissions";
import type { FenrirRole } from "./types";

export const ROLE_MAP: Record<AppRole, FenrirRole> = {
  admin: "admin",
  manager: "property_manager",
  front_desk_supervisor: "front_desk",
  front_desk: "front_desk",
  maintenance: "maintenance",
  viewer: "front_desk", // viewers map to front_desk (read-only staff)
  guest: "guest",
};

export function mapRole(role: AppRole | null): FenrirRole {
  if (!role) return "guest";
  return ROLE_MAP[role] ?? "guest";
}
