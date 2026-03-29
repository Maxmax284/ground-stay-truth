import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Inbound webhook handler for Fenrir Lock commands.
 * Accepts: emergency_freeze, emergency_unfreeze, increase_threat_level, get_system_status
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const receiveToken = Deno.env.get("FENRIR_RECEIVE_TOKEN") || "";

  // Validate auth token (constant-time comparison)
  const authHeader = req.headers.get("authorization") || "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!receiveToken || !constantTimeEqual(providedToken, receiveToken)) {
    return new Response(
      JSON.stringify({ status: "error", message: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { command, reason, issued_by, metadata } = body;

    if (!command) {
      return new Response(
        JSON.stringify({ status: "error", message: "command field required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const executedAt = new Date().toISOString();
    let responseDetails: Record<string, unknown> = {};

    // Log the inbound command as a security event
    await supabase.from("security_events").insert({
      event_type: `fenrir_command_${command}`,
      severity: command === "emergency_freeze" ? "critical" : "high",
      actor_role: "fenrir_system",
      details: { source_platform: "fenrir_lock", command, reason, issued_by, metadata },
      confidence_score: 100,
    });

    switch (command) {
      case "emergency_freeze": {
        await supabase
          .from("policy_settings")
          .update({ value: JSON.stringify("true") })
          .eq("key", "security_freeze_active");

        await supabase
          .from("policy_settings")
          .update({ value: JSON.stringify("critical") })
          .eq("key", "security_threat_level");

        // Notify all admin users
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const adminIds = [...new Set((adminRoles ?? []).map((r: any) => r.user_id))];
        if (adminIds.length > 0) {
          await supabase.from("notifications").insert(
            adminIds.map((uid: string) => ({
              user_id: uid,
              type: "security_freeze",
              message: `🚨 EMERGENCY FREEZE activated by Fenrir Lock. Reason: ${reason || "Security incident detected"}. All non-essential operations locked.`,
            }))
          );
        }

        responseDetails = {
          affected_properties: 1,
          active_sessions_preserved: true,
          admin_users_notified: adminIds.length,
        };
        break;
      }

      case "emergency_unfreeze": {
        await supabase
          .from("policy_settings")
          .update({ value: JSON.stringify("false") })
          .eq("key", "security_freeze_active");

        await supabase
          .from("policy_settings")
          .update({ value: JSON.stringify("normal") })
          .eq("key", "security_threat_level");

        // Notify admins
        const { data: adminRoles2 } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const adminIds2 = [...new Set((adminRoles2 ?? []).map((r: any) => r.user_id))];
        if (adminIds2.length > 0) {
          await supabase.from("notifications").insert(
            adminIds2.map((uid: string) => ({
              user_id: uid,
              type: "security_unfreeze",
              message: `✅ Emergency freeze LIFTED by Fenrir Lock. Normal operations restored. Reason: ${reason || "Incident resolved"}`,
            }))
          );
        }

        responseDetails = {
          operations_restored: true,
          admin_users_notified: adminIds2.length,
        };
        break;
      }

      case "increase_threat_level": {
        const newLevel = metadata?.threat_level || "elevated";
        await supabase
          .from("policy_settings")
          .update({ value: JSON.stringify(newLevel) })
          .eq("key", "security_threat_level");

        responseDetails = {
          new_threat_level: newLevel,
          mfa_enforcement: newLevel === "high" || newLevel === "critical",
        };
        break;
      }

      case "get_system_status": {
        // Return current system health
        const { count: activeUsers } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });

        const { data: freezePolicy } = await supabase
          .from("policy_settings")
          .select("value")
          .eq("key", "security_freeze_active")
          .single();

        const { data: threatPolicy } = await supabase
          .from("policy_settings")
          .select("value")
          .eq("key", "security_threat_level")
          .single();

        const { count: recentEvents } = await supabase
          .from("security_events")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        responseDetails = {
          active_users: activeUsers ?? 0,
          security_posture: String(threatPolicy?.value ?? "normal").replace(/^"|"$/g, ""),
          frozen: String(freezePolicy?.value ?? "false").replace(/^"|"$/g, "") === "true",
          recent_security_events_24h: recentEvents ?? 0,
          operational_mode: "normal",
          platform_version: "groundstay-1.0",
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ status: "error", message: `Unknown command: ${command}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        command,
        executed_at: executedAt,
        details: responseDetails,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fenrir-webhook] Error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/** Constant-time string comparison to prevent timing attacks */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
