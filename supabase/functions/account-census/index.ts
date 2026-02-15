import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role using service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    const isAdmin = roles.includes("admin");
    const isManager = roles.includes("manager");
    const isViewer = roles.includes("viewer");

    if (!isAdmin && !isManager && !isViewer) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine caller tier
    const tier = isAdmin ? "admin" : isManager ? "manager" : "viewer";

    // Fetch all profiles
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, full_name, email, created_at, last_sign_in_at");

    // Fetch all roles
    const { data: allRoles } = await adminClient
      .from("user_roles")
      .select("user_id, role");

    // Fetch bookings (active states)
    const activeStates = [
      "pending_approval",
      "pending_deposit",
      "confirmed",
      "checked_in",
    ];
    const { data: activeBookings } = await adminClient
      .from("bookings")
      .select("id, guest_id")
      .in("state", activeStates);

    // Fetch all bookings for counts
    const { data: allBookings } = await adminClient
      .from("bookings")
      .select("id, guest_id");

    const profileList = profiles ?? [];
    const roleList = allRoles ?? [];
    const activeBookingList = activeBookings ?? [];
    const allBookingList = allBookings ?? [];

    // Build role map: user_id -> highest role
    const rolePriority: Record<string, number> = {
      guest: 0,
      viewer: 1,
      maintenance: 2,
      front_desk: 3,
      front_desk_supervisor: 4,
      manager: 5,
      admin: 6,
    };
    const userRoleMap: Record<string, string> = {};
    for (const r of roleList) {
      const existing = userRoleMap[r.user_id];
      if (
        !existing ||
        (rolePriority[r.role] ?? 0) > (rolePriority[existing] ?? 0)
      ) {
        userRoleMap[r.user_id] = r.role;
      }
    }

    // Role counts
    const roleCounts: Record<string, number> = {};
    for (const uid of Object.keys(userRoleMap)) {
      const role = userRoleMap[uid];
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }

    // Active/dormant (90 days)
    const now = new Date();
    const ninetyDaysAgo = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000
    );

    let activeCount = 0;
    let dormantCount = 0;
    let activeGuests = 0;
    let dormantGuests = 0;
    let activeStaff = 0;
    let dormantStaff = 0;

    const staffRoles = [
      "front_desk",
      "front_desk_supervisor",
      "manager",
      "admin",
      "maintenance",
      "viewer",
    ];

    for (const p of profileList) {
      const isActive =
        p.last_sign_in_at && new Date(p.last_sign_in_at) >= ninetyDaysAgo;
      const role = userRoleMap[p.user_id] ?? "guest";
      const isStaff = staffRoles.includes(role) && role !== "guest";

      if (isActive) {
        activeCount++;
        if (role === "guest") activeGuests++;
        if (isStaff) activeStaff++;
      } else {
        dormantCount++;
        if (role === "guest") dormantGuests++;
        if (isStaff) dormantStaff++;
      }
    }

    // Booking stats
    const usersWithActiveBookings = new Set(
      activeBookingList.filter((b) => b.guest_id).map((b) => b.guest_id)
    );
    const usersWithAnyBookings = new Set(
      allBookingList.filter((b) => b.guest_id).map((b) => b.guest_id)
    );

    // Booking count per user
    const bookingCountMap: Record<string, number> = {};
    for (const b of allBookingList) {
      if (b.guest_id) {
        bookingCountMap[b.guest_id] = (bookingCountMap[b.guest_id] ?? 0) + 1;
      }
    }

    const totalAccounts = profileList.length;
    const totalGuests = roleCounts["guest"] ?? 0;
    const totalStaff = Object.entries(roleCounts)
      .filter(([r]) => r !== "guest")
      .reduce((s, [, c]) => s + c, 0);
    const totalAdmins = roleCounts["admin"] ?? 0;
    const withActiveBookings = usersWithActiveBookings.size;
    const withBookingHistory = usersWithAnyBookings.size;
    const zeroActivity = profileList.filter(
      (p) => !p.last_sign_in_at && !usersWithAnyBookings.has(p.user_id)
    ).length;

    // Base response (viewer level)
    const response: Record<string, unknown> = {
      tier,
      snapshot: {
        totalAccounts,
        totalGuests,
        totalStaff,
        totalAdmins,
        activeAccounts: activeCount,
        dormantAccounts: dormantCount,
        withActiveBookings,
        withBookingHistory,
        zeroActivity,
      },
    };

    // Manager+ gets role distribution + activity breakdown
    if (tier === "manager" || tier === "admin") {
      response.roleDistribution = Object.entries(roleCounts).map(
        ([role, count]) => ({ role, count })
      );
      response.activityBreakdown = {
        activeGuests,
        dormantGuests,
        activeStaff,
        dormantStaff,
      };
    }

    // Admin gets detailed table
    if (tier === "admin") {
      response.accounts = profileList.map((p) => ({
        userId: p.user_id,
        name: p.full_name || null,
        email: p.email || null,
        role: userRoleMap[p.user_id] ?? "guest",
        lastLogin: p.last_sign_in_at,
        hasActiveBooking: usersWithActiveBookings.has(p.user_id),
        totalBookings: bookingCountMap[p.user_id] ?? 0,
        createdAt: p.created_at,
      }));
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("account-census error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
