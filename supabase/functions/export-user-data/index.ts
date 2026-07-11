// export-user-data
// -----------------------------------------------------------------------------
// GDPR / PDPA data export. User requests everything we have on them; we
// bundle profile, bookings, payments, messages, documents, consents into a
// downloadable JSON. Audit + Fenrir event on every export.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFenrirSecurityEvent } from "../_shared/fenrir.ts";

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
 * GDPR Data Export (DSAR / Right to Portability)
 * Returns all personal data associated with the authenticated user as JSON.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const userId = user.id;

    // Gather all user data in parallel
    const [
      profileRes,
      bookingsRes,
      paymentsRes,
      messagesRes,
      notificationsRes,
      consentsRes,
      reviewsRes,
      documentsRes,
      pickupsRes,
      rolesRes,
    ] = await Promise.all([
      adminClient.from("profiles").select("*").eq("user_id", userId),
      adminClient.from("bookings").select("id, check_in, check_out, num_guests, guest_type, state, total_price, notes, created_at").eq("guest_id", userId),
      adminClient.from("payments").select("id, amount, method, status, payment_type, description, created_at").eq("recorded_by", userId),
      adminClient.from("messages").select("id, content, created_at, is_internal, booking_id").eq("sender_id", userId).eq("is_internal", false),
      adminClient.from("notifications").select("id, type, message, created_at, read").eq("user_id", userId),
      adminClient.from("user_consents").select("*").eq("user_id", userId),
      adminClient.from("reviews").select("id, title, body, rating, created_at, status").eq("guest_id", userId),
      adminClient.from("guest_documents").select("id, file_name, created_at, verification_status"),
      adminClient.from("airport_pickups").select("id, flight_number, status, arrival_datetime, created_at").eq("booking_id", userId),
      adminClient.from("user_roles").select("role, created_at").eq("user_id", userId),
    ]);

    // Get booking IDs for related data
    const bookingIds = (bookingsRes.data ?? []).map((b: any) => b.id);

    // Fetch booking-linked payments too
    let bookingPayments: any[] = [];
    if (bookingIds.length > 0) {
      const { data } = await adminClient
        .from("payments")
        .select("id, amount, method, status, payment_type, description, created_at, booking_id")
        .in("booking_id", bookingIds);
      bookingPayments = data ?? [];
    }

    const exportData = {
      export_date: new Date().toISOString(),
      export_version: "1.0",
      user: {
        id: userId,
        email: user.email,
        created_at: user.created_at,
      },
      profile: profileRes.data?.[0] ?? null,
      roles: rolesRes.data ?? [],
      consents: consentsRes.data ?? [],
      bookings: bookingsRes.data ?? [],
      payments: bookingPayments,
      messages_sent: (messagesRes.data ?? []).length,
      messages: (messagesRes.data ?? []).map((m: any) => ({
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        booking_id: m.booking_id,
      })),
      notifications: notificationsRes.data ?? [],
      reviews: reviewsRes.data ?? [],
      documents: (documentsRes.data ?? []).map((d: any) => ({
        id: d.id,
        file_name: d.file_name,
        created_at: d.created_at,
        verification_status: d.verification_status,
      })),
    };

    // Log the data export for audit
    await adminClient.from("security_events").insert({
      event_type: "data_export_requested",
      severity: "info",
      actor_id: userId,
      actor_email: user.email,
      details: { tables_exported: Object.keys(exportData).length },
    });

    // Fenrir: bulk guest export (server-side, PII-scrubbed).
    // We deliberately pass counts + booleans, never the raw payload.
    await sendFenrirSecurityEvent(
      {
        event_type: "bulk_guest_export",
        severity: "high",
        confidence_score: 95,
        details: {
          source_platform: "groundstay",
          actor_id: userId,
          actor_role: "guest",
          actor_email: user.email, // will be hashed to actor_email_hash
          record_count: (bookingsRes.data ?? []).length + bookingPayments.length,
          booking_count: (bookingsRes.data ?? []).length,
          payment_count: bookingPayments.length,
          message_count: (messagesRes.data ?? []).length,
          document_count: (documentsRes.data ?? []).length,
          export_format: "json",
          includes_pii: true,
          self_service: true,
        },
      },
      { supabase: adminClient },
    );

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="groundstay-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error("export-user-data error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
