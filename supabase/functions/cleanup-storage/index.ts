import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

/**
 * Storage Cleanup
 *
 * Removes orphaned files from guest-documents and maintenance-photos buckets
 * where the referencing DB row no longer exists.
 *
 * Should be called via pg_cron weekly.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: accept service role key OR anon key (for pg_cron via pg_net)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";
    if (token !== serviceRoleKey && token !== anonKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const results: Record<string, number> = {};

    // 1. Guest documents — find files not referenced in guest_documents table
    const { data: guestFiles } = await supabase.storage
      .from("guest-documents")
      .list("", { limit: 500 });

    let guestOrphans = 0;
    if (guestFiles && guestFiles.length > 0) {
      // Get all referenced file paths
      const { data: dbDocs } = await supabase
        .from("guest_documents")
        .select("file_path");

      const referencedPaths = new Set((dbDocs ?? []).map((d: any) => d.file_path));

      for (const file of guestFiles) {
        // Skip folders
        if (!file.name || file.metadata?.mimetype === "application/x-directory") continue;

        const filePath = file.name;
        if (!referencedPaths.has(filePath) && !referencedPaths.has(`guest-documents/${filePath}`)) {
          // Check file age — only delete if older than 7 days
          const createdAt = file.created_at ? new Date(file.created_at) : null;
          if (createdAt && Date.now() - createdAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
            const { error } = await supabase.storage
              .from("guest-documents")
              .remove([filePath]);
            if (!error) guestOrphans++;
          }
        }
      }
    }
    results["guest-documents"] = guestOrphans;

    // 2. Maintenance photos — find files not referenced in maintenance_requests
    const { data: maintFiles } = await supabase.storage
      .from("maintenance-photos")
      .list("", { limit: 500 });

    let maintOrphans = 0;
    if (maintFiles && maintFiles.length > 0) {
      const { data: dbMaint } = await supabase
        .from("maintenance_requests")
        .select("photo_url");

      const referencedUrls = new Set(
        (dbMaint ?? [])
          .map((m: any) => m.photo_url)
          .filter(Boolean)
      );

      for (const file of maintFiles) {
        if (!file.name || file.metadata?.mimetype === "application/x-directory") continue;

        const filePath = file.name;
        // Check if any referenced URL contains this filename
        const isReferenced = Array.from(referencedUrls).some(
          (url: string) => url.includes(filePath)
        );

        if (!isReferenced) {
          const createdAt = file.created_at ? new Date(file.created_at) : null;
          if (createdAt && Date.now() - createdAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
            const { error } = await supabase.storage
              .from("maintenance-photos")
              .remove([filePath]);
            if (!error) maintOrphans++;
          }
        }
      }
    }
    results["maintenance-photos"] = maintOrphans;

    return new Response(
      JSON.stringify({ success: true, removed: results, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
