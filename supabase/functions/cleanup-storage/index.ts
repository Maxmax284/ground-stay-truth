import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/dev origins
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
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
    return new Response(null, { headers: getCorsHeaders(req) });
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const results: Record<string, number> = {};

    // 1. Guest documents — enforce 90-day retention after checkout
    const { data: guestFiles } = await supabase.storage
      .from("guest-documents")
      .list("", { limit: 500 });

    let guestOrphans = 0;
    let guestRetention = 0;
    if (guestFiles && guestFiles.length > 0) {
      // Get all referenced file paths with booking checkout dates
      const { data: dbDocs } = await supabase
        .from("guest_documents")
        .select("file_path, booking_id, bookings(check_out, state)");

      const referencedPaths = new Set((dbDocs ?? []).map((d: any) => d.file_path));
      
      // F-07: Build a map of file paths to checkout dates for retention enforcement
      const pathToCheckout = new Map<string, string>();
      for (const doc of (dbDocs ?? [])) {
        const checkout = (doc as any).bookings?.check_out;
        const state = (doc as any).bookings?.state;
        if (checkout && (state === "completed" || state === "cancelled")) {
          pathToCheckout.set(doc.file_path, checkout);
        }
      }

      const RETENTION_DAYS = 90;

      for (const file of guestFiles) {
        if (!file.name || file.metadata?.mimetype === "application/x-directory") continue;

        const filePath = file.name;
        const isReferenced = referencedPaths.has(filePath) || referencedPaths.has(`guest-documents/${filePath}`);
        const createdAt = file.created_at ? new Date(file.created_at) : null;

        if (!isReferenced) {
          // Orphaned file — delete if older than 7 days
          if (createdAt && Date.now() - createdAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
            const { error } = await supabase.storage
              .from("guest-documents")
              .remove([filePath]);
            if (!error) guestOrphans++;
          }
        } else {
          // F-07: Check 90-day retention policy for completed/cancelled bookings
          const checkoutDate = pathToCheckout.get(filePath) || pathToCheckout.get(`guest-documents/${filePath}`);
          if (checkoutDate) {
            const daysSinceCheckout = (Date.now() - new Date(checkoutDate).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceCheckout > RETENTION_DAYS) {
              // Delete the storage file
              const { error: storageErr } = await supabase.storage
                .from("guest-documents")
                .remove([filePath]);
              if (!storageErr) {
                // Delete the DB record too
                await supabase
                  .from("guest_documents")
                  .delete()
                  .eq("file_path", filePath);
                guestRetention++;
              }
            }
          }
        }
      }
    }
    results["guest-documents-orphans"] = guestOrphans;
    results["guest-documents-retention"] = guestRetention;

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
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
