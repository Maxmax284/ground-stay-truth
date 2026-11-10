// Shared caller verification for privileged edge functions.
// - Internal callers: other edge functions (service-role bearer/apikey) or
//   pg_cron jobs presenting x-internal-token = integration_secrets.cron_internal_token.
// - Staff callers: a signed-in user whose server-side role is in the allowed list.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

let cachedCronToken: string | null = null;

function bearer(req: Request): string {
  const h = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function isInternalCaller(req: Request): Promise<boolean> {
  const b = bearer(req);
  const apikey = req.headers.get("apikey") || "";
  if (SERVICE_KEY && (b === SERVICE_KEY || apikey === SERVICE_KEY)) return true;
  const tok = req.headers.get("x-internal-token") || "";
  if (!tok) return false;
  if (!cachedCronToken) {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await admin
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "cron_internal_token")
      .maybeSingle();
    cachedCronToken = data?.encrypted_value ?? null;
  }
  return !!cachedCronToken && cachedCronToken.length >= 32 && tok === cachedCronToken;
}

export interface StaffCaller { userId: string; roles: string[] }

export const STAFF_ROLES = ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer"];

/** Returns the signed-in caller (with roles) or null. */
export async function getCaller(req: Request): Promise<StaffCaller | null> {
  const b = bearer(req);
  if (!b || b === SERVICE_KEY || b === ANON_KEY) return null;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.auth.getUser(b);
  if (error || !data?.user) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  return { userId: data.user.id, roles: (roles ?? []).map((r: any) => String(r.role)) };
}

export async function getStaffCaller(req: Request, allowed: string[] = STAFF_ROLES): Promise<StaffCaller | null> {
  const c = await getCaller(req);
  if (!c) return null;
  return c.roles.some((r) => allowed.includes(r)) ? c : null;
}

/** Internal OR allowed staff. */
export async function isInternalOrStaff(req: Request, allowed: string[] = STAFF_ROLES): Promise<boolean> {
  if (await isInternalCaller(req)) return true;
  return !!(await getStaffCaller(req, allowed));
}

export function unauthorized(headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
