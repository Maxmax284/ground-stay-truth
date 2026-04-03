import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── SERVER-SIDE CACHE ──────────────────────────────────────────────────────
// Cache responses per role+language for 2 minutes to prevent excessive DB queries

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const responseCache = new Map<string, { data: any; expiresAt: number }>();

function getCached(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  // Evict old entries if cache grows too large
  if (responseCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of responseCache) {
      if (now > v.expiresAt) responseCache.delete(k);
    }
  }
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Severity = "urgent" | "attention" | "normal";
type SignalCategory = "money" | "time" | "ops" | "system";

interface Signal {
  severity: Severity;
  category: SignalCategory;
  messageKey: string;
  params: Record<string, string | number>;
  roles: string[];
  isUpcoming?: boolean;
}

// ─── SEVERITY SORT ORDER ─────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, attention: 1, normal: 2 };

// ─── ROLE FILTER MAP ─────────────────────────────────────────────────────────

const ROLE_CATEGORIES: Record<string, SignalCategory[]> = {
  admin: ["money", "time", "ops", "system"],
  manager: ["money", "time", "ops"],
  front_desk_supervisor: ["money", "time", "ops"],
  front_desk: ["time", "ops"],
  maintenance: ["ops"],
  viewer: ["time", "ops"],
};

// ─── MESSAGE TEMPLATES (English base) ────────────────────────────────────────

const MESSAGES: Record<string, string> = {
  unpaid_deposits: "{count} booking(s) awaiting deposit",
  outstanding_today: "{count} arriving today with outstanding balance",
  failed_payments: "{count} failed payment(s) in last 48h",
  refunds_processed: "{count} refund(s) processed in last 24h",
  expiring_sessions: "{count} payment session(s) expiring within 6h",
  arrival_no_id: "{count} arriving today without verified ID",
  arrival_no_pickup: "{count} arriving today — pickup not assigned",
  departure_housekeeping: "{count} departing today — housekeeping not started",
  approval_aging: "{count} booking(s) pending approval over 12h",
  soft_hold_expiring: "{count} soft hold(s) expiring soon",
  urgent_maintenance: "{count} urgent maintenance request(s) open over 4h",
  stale_laundry: "{count} laundry request(s) stale over 24h",
  housekeeping_overdue: "{count} housekeeping task(s) overdue",
  pickup_tomorrow_no_driver: "{count} pickup(s) tomorrow with no driver",
  admin_overrides: "{count} override(s) logged in last 24h",
  unprocessed_events: "{count} unprocessed payment event(s)",
  early_checkin_pending: "{count} early check-in request(s) pending",
  essentials_missing: "{count} check-in(s) today missing WiFi or emergency info",
  essentials_ready: "Stay essentials ready for {count} check-in(s) today",
  upcoming_arrivals: "{count} arrival(s) tomorrow",
  upcoming_departures: "{count} departure(s) tomorrow",
  upcoming_maintenance_block: "Maintenance block starts {date} — {unit}",
  // Manual Assist signals
  manual_assist_active: "{count} pickup(s) in manual assist — automation paused",
  manual_assist_degraded: "{count} pickup(s) with reduced confidence — check flight data",
  manual_assist_recovery: "{count} pickup(s) ready to resume automation — admin approval needed",
  // Pre-arrival checklist signals
  checklist_no_connectivity: "{count} arriving guest(s) with no connectivity plan — pickup communication at risk",
  checklist_no_samui_flight: "{count} arriving guest(s) missing Samui flight — pickup timing unavailable",
  checklist_critical_gaps: "{count} arriving guest(s) with incomplete critical checklist items",
};

function renderMessage(key: string, params: Record<string, string | number>): string {
  let msg = MESSAGES[key] || key;
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replace(`{${k}}`, String(v));
  }
  return msg;
}

// ─── SIGNAL EXTRACTION ──────────────────────────────────────────────────────

async function extractSignals(adminClient: any): Promise<Signal[]> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
  const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString();

  // Run all queries in parallel
  const [
    pendingDepositRes,
    arrivingTodayRes,
    failedPaymentsRes,
    recentRefundsRes,
    expiringSessionsRes,
    arrivingDocsRes,
    pickupsTodayRes,
    departingTodayRes,
    housekeepingDeparturesRes,
    agingApprovalsRes,
    softHoldsRes,
    urgentMaintenanceRes,
    staleLaundryRes,
    overdueHousekeepingRes,
    pickupsTomorrowRes,
    overrideLogsRes,
    unprocessedEventsRes,
    earlyCheckinRes,
    arrivingTomorrowRes,
    departingTomorrowRes,
    upcomingBlocksRes,
    // Manual Assist queries
    manualAssistRes,
    degradedAssistRes,
    recoveryPendingRes,
    // Pre-arrival checklist queries
    checklistArrivingSoonRes,
  ] = await Promise.all([
    // 💰 Unpaid deposits (exclude cancelled/completed/no_show)
    adminClient.from("bookings").select("id", { count: "exact", head: true })
      .eq("state", "pending_deposit"),

    // 💰 Arriving today (to check outstanding)
    adminClient.from("bookings")
      .select("id, total_price, guest_id")
      .eq("check_in", today)
      .in("state", ["confirmed", "pending_deposit"]),

    // 💰 Failed payments (48h)
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .eq("status", "failed").gte("created_at", fortyEightHoursAgo),

    // 💰 Refunds (24h)
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .gt("refund_amount", 0).gte("created_at", twentyFourHoursAgo),

    // 💰 Expiring payment sessions
    adminClient.from("payments").select("id", { count: "exact", head: true })
      .eq("status", "pending").lte("expires_at", sixHoursFromNow).gte("expires_at", now.toISOString()),

    // ⏳ Arriving today — check docs
    adminClient.from("bookings")
      .select("id, guest_documents(id, verification_status)")
      .eq("check_in", today)
      .in("state", ["confirmed", "pending_deposit"]),

    // ⏳ Pickups today — exclude cancelled/completed pickups
    adminClient.from("airport_pickups")
      .select("id, status, driver_id, booking_id, bookings!inner(check_in, state)")
      .eq("bookings.check_in", today)
      .not("status", "in", '("cancelled","completed")')
      .is("driver_id", null),

    // ⏳ Departures today
    adminClient.from("bookings")
      .select("id").eq("check_out", today).eq("state", "checked_in"),

    // ⏳ Housekeeping for departures today
    adminClient.from("housekeeping_tasks")
      .select("id, status, booking_out_id, bookings!housekeeping_tasks_booking_out_id_fkey(check_out)")
      .eq("status", "pending"),

    // ⏳ Aging approvals (>12h)
    adminClient.from("bookings").select("id", { count: "exact", head: true })
      .eq("state", "pending_approval").lt("created_at", twelveHoursAgo),

    // ⏳ Soft holds expiring (>10h old)
    adminClient.from("bookings").select("id", { count: "exact", head: true })
      .eq("state", "soft_hold").lt("created_at", tenHoursAgo),

    // 🏠 Urgent maintenance (>4h)
    adminClient.from("maintenance_requests").select("id", { count: "exact", head: true })
      .eq("status", "open").eq("priority", "urgent").lt("created_at", fourHoursAgo),

    // 🏠 Stale laundry (>24h) — only for active bookings
    adminClient.from("laundry_requests")
      .select("id, bookings!inner(state)", { count: "exact", head: true })
      .eq("status", "in_progress")
      .in("bookings.state", ["confirmed", "checked_in"])
      .lt("created_at", twentyFourHoursAgo),

    // 🏠 Overdue housekeeping
    adminClient.from("housekeeping_tasks").select("id", { count: "exact", head: true })
      .eq("status", "pending").lt("due_by", now.toISOString()),

    // 🏠 Pickups tomorrow no driver — exclude cancelled/completed pickups
    adminClient.from("airport_pickups")
      .select("id, booking_id, bookings!inner(check_in, state)")
      .eq("bookings.check_in", tomorrow)
      .not("status", "in", '("cancelled","completed")')
      .is("driver_id", null),

    // ⚙️ Overrides (24h)
    adminClient.from("booking_state_log").select("id", { count: "exact", head: true })
      .ilike("reason", "%override%").gte("created_at", twentyFourHoursAgo),

    // ⚙️ Unprocessed payment events
    adminClient.from("payment_events").select("id", { count: "exact", head: true })
      .eq("processed", false),

    // ⚙️ Early check-in pending
    adminClient.from("early_checkin_requests").select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    // Upcoming: arrivals tomorrow
    adminClient.from("bookings").select("id", { count: "exact", head: true })
      .eq("check_in", tomorrow).in("state", ["confirmed", "pending_deposit"]),

    // Upcoming: departures tomorrow
    adminClient.from("bookings").select("id", { count: "exact", head: true })
      .eq("check_out", tomorrow).eq("state", "checked_in"),

    // Upcoming: maintenance blocks starting within 3 days
    adminClient.from("maintenance_blocks")
      .select("id, start_date, unit_id, units(name)")
      .gte("start_date", today)
      .lte("start_date", new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .limit(3),

    // 🛡️ Manual Assist: active manual assist pickups
    adminClient.from("airport_pickups").select("id", { count: "exact", head: true })
      .eq("assist_mode", "manual_assist")
      .not("status", "in", '("cancelled","completed")'),

    // 🛡️ Manual Assist: degraded pickups
    adminClient.from("airport_pickups").select("id", { count: "exact", head: true })
      .eq("assist_mode", "degraded")
      .not("status", "in", '("cancelled","completed")'),

    // 🛡️ Manual Assist: recovery pending
    adminClient.from("airport_pickups").select("id", { count: "exact", head: true })
      .eq("assist_mode", "recovery_pending")
      .not("status", "in", '("cancelled","completed")'),

    // 📋 Pre-arrival: get checklist items for bookings arriving within 3 days
    adminClient.from("pre_arrival_checklist")
      .select("booking_id, item_key, completed, bookings!inner(check_in, state, guest_id)")
      .in("bookings.state", ["confirmed", "pending_deposit"])
      .gte("bookings.check_in", today)
      .lte("bookings.check_in", new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
  ]);

  const signals: Signal[] = [];

  // ── 💰 MONEY ──

  const pendingDepositCount = pendingDepositRes.count ?? 0;
  if (pendingDepositCount > 0) {
    signals.push({
      severity: pendingDepositCount >= 3 ? "urgent" : "attention",
      category: "money",
      messageKey: "unpaid_deposits",
      params: { count: pendingDepositCount },
      roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
    });
  }

  // Outstanding on arriving-today bookings
  const arrivingToday = arrivingTodayRes.data ?? [];
  if (arrivingToday.length > 0) {
    // Check which have recorded payments
    const arrivingIds = arrivingToday.map((b: any) => b.id);
    const { data: paidBookings } = await adminClient
      .from("payments")
      .select("booking_id")
      .in("booking_id", arrivingIds)
      .eq("status", "recorded");
    const paidSet = new Set((paidBookings ?? []).map((p: any) => p.booking_id));
    const unpaidCount = arrivingToday.filter((b: any) => !paidSet.has(b.id)).length;
    if (unpaidCount > 0) {
      signals.push({
        severity: "urgent",
        category: "money",
        messageKey: "outstanding_today",
        params: { count: unpaidCount },
        roles: ["admin", "manager", "front_desk_supervisor"],
      });
    }
  }

  const failedCount = failedPaymentsRes.count ?? 0;
  if (failedCount > 0) {
    signals.push({
      severity: "urgent",
      category: "money",
      messageKey: "failed_payments",
      params: { count: failedCount },
      roles: ["admin", "manager"],
    });
  }

  const refundCount = recentRefundsRes.count ?? 0;
  if (refundCount > 0) {
    signals.push({
      severity: "attention",
      category: "money",
      messageKey: "refunds_processed",
      params: { count: refundCount },
      roles: ["admin"],
    });
  }

  const expiringCount = expiringSessionsRes.count ?? 0;
  if (expiringCount > 0) {
    signals.push({
      severity: "urgent",
      category: "money",
      messageKey: "expiring_sessions",
      params: { count: expiringCount },
      roles: ["admin", "manager"],
    });
  }

  // ── ⏳ TIME-SENSITIVE ──

  const arrivingDocs = arrivingDocsRes.data ?? [];
  const noIdCount = arrivingDocs.filter((b: any) => {
    const docs = b.guest_documents ?? [];
    return !docs.some((d: any) => d.verification_status === "verified");
  }).length;
  if (noIdCount > 0) {
    signals.push({
      severity: "urgent",
      category: "time",
      messageKey: "arrival_no_id",
      params: { count: noIdCount },
      roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
    });
  }

  const noPickupToday = (pickupsTodayRes.data ?? []).length;
  if (noPickupToday > 0) {
    signals.push({
      severity: "urgent",
      category: "time",
      messageKey: "arrival_no_pickup",
      params: { count: noPickupToday },
      roles: ["admin", "manager", "front_desk"],
    });
  }

  // Housekeeping not started for departures today
  const departuresToday = (departingTodayRes.data ?? []).map((b: any) => b.id);
  const housekeepingAll = housekeepingDeparturesRes.data ?? [];
  const housekeepingNotStarted = housekeepingAll.filter((h: any) => {
    const bookingCheckout = (h as any).bookings?.check_out;
    return bookingCheckout === today;
  }).length;
  if (housekeepingNotStarted > 0) {
    signals.push({
      severity: "attention",
      category: "time",
      messageKey: "departure_housekeeping",
      params: { count: housekeepingNotStarted },
      roles: ["admin", "manager", "front_desk"],
    });
  }

  const agingCount = agingApprovalsRes.count ?? 0;
  if (agingCount > 0) {
    signals.push({
      severity: "attention",
      category: "time",
      messageKey: "approval_aging",
      params: { count: agingCount },
      roles: ["admin"],
    });
  }

  const softHoldCount = softHoldsRes.count ?? 0;
  if (softHoldCount > 0) {
    signals.push({
      severity: "attention",
      category: "time",
      messageKey: "soft_hold_expiring",
      params: { count: softHoldCount },
      roles: ["admin", "manager"],
    });
  }

  // ── 🏠 OPS ──

  const urgentMaintCount = urgentMaintenanceRes.count ?? 0;
  if (urgentMaintCount > 0) {
    signals.push({
      severity: "urgent",
      category: "ops",
      messageKey: "urgent_maintenance",
      params: { count: urgentMaintCount },
      roles: ["admin", "manager", "maintenance"],
    });
  }

  const staleLaundryCount = staleLaundryRes.count ?? 0;
  if (staleLaundryCount > 0) {
    signals.push({
      severity: "attention",
      category: "ops",
      messageKey: "stale_laundry",
      params: { count: staleLaundryCount },
      roles: ["admin", "manager", "front_desk"],
    });
  }

  const overdueHKCount = overdueHousekeepingRes.count ?? 0;
  if (overdueHKCount > 0) {
    signals.push({
      severity: "urgent",
      category: "ops",
      messageKey: "housekeeping_overdue",
      params: { count: overdueHKCount },
      roles: ["admin", "manager", "front_desk"],
    });
  }

  const pickupTomorrowCount = (pickupsTomorrowRes.data ?? []).length;
  if (pickupTomorrowCount > 0) {
    signals.push({
      severity: "attention",
      category: "ops",
      messageKey: "pickup_tomorrow_no_driver",
      params: { count: pickupTomorrowCount },
      roles: ["admin", "manager", "front_desk"],
    });
  }

  // ── ⚙️ SYSTEM ──

  const overrideCount = overrideLogsRes.count ?? 0;
  if (overrideCount > 0) {
    signals.push({
      severity: "attention",
      category: "system",
      messageKey: "admin_overrides",
      params: { count: overrideCount },
      roles: ["admin"],
    });
  }

  const unprocessedCount = unprocessedEventsRes.count ?? 0;
  if (unprocessedCount > 0) {
    signals.push({
      severity: "urgent",
      category: "system",
      messageKey: "unprocessed_events",
      params: { count: unprocessedCount },
      roles: ["admin"],
    });
  }

  const earlyCheckinCount = earlyCheckinRes.count ?? 0;
  if (earlyCheckinCount > 0) {
    signals.push({
      severity: "attention",
      category: "system",
      messageKey: "early_checkin_pending",
      params: { count: earlyCheckinCount },
      roles: ["admin", "manager"],
    });
  }

  // ── 🛡️ MANUAL ASSIST ──

  const manualAssistCount = manualAssistRes.count ?? 0;
  if (manualAssistCount > 0) {
    signals.push({
      severity: "urgent",
      category: "ops",
      messageKey: "manual_assist_active",
      params: { count: manualAssistCount },
      roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
    });
  }

  const degradedCount = degradedAssistRes.count ?? 0;
  if (degradedCount > 0) {
    signals.push({
      severity: "attention",
      category: "ops",
      messageKey: "manual_assist_degraded",
      params: { count: degradedCount },
      roles: ["admin", "manager", "front_desk_supervisor"],
    });
  }

  const recoveryCount = recoveryPendingRes.count ?? 0;
  if (recoveryCount > 0) {
    signals.push({
      severity: "attention",
      category: "system",
      messageKey: "manual_assist_recovery",
      params: { count: recoveryCount },
      roles: ["admin"],
    });
  }

  // ── 📋 PRE-ARRIVAL CHECKLIST GAPS ──
  const checklistData = checklistArrivingSoonRes.data ?? [];
  if (checklistData.length > 0) {
    // Group by booking to find critical gaps
    const byBooking = new Map<string, Set<string>>();
    for (const row of checklistData) {
      if (row.completed) {
        if (!byBooking.has(row.booking_id)) byBooking.set(row.booking_id, new Set());
        byBooking.get(row.booking_id)!.add(row.item_key);
      }
    }

    // Get unique booking IDs from checklist data
    const allBookingIds = [...new Set(checklistData.map((r: any) => r.booking_id))];
    const criticalKeys = ["connectivity_readiness", "confirm_domestic_flight", "tdac_completed", "upload_id", "confirm_arrival_time"];

    let noConnectivity = 0;
    let noSamuiFlight = 0;
    let criticalGaps = 0;

    for (const bid of allBookingIds) {
      const completed = byBooking.get(bid) ?? new Set();
      if (!completed.has("connectivity_readiness")) noConnectivity++;
      if (!completed.has("confirm_domestic_flight")) noSamuiFlight++;
      const missingCritical = criticalKeys.filter((k) => !completed.has(k));
      if (missingCritical.length > 0) criticalGaps++;
    }

    if (noConnectivity > 0) {
      signals.push({
        severity: "attention",
        category: "ops",
        messageKey: "checklist_no_connectivity",
        params: { count: noConnectivity },
        roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
      });
    }

    if (noSamuiFlight > 0) {
      signals.push({
        severity: "attention",
        category: "time",
        messageKey: "checklist_no_samui_flight",
        params: { count: noSamuiFlight },
        roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
      });
    }

    if (criticalGaps > 0 && criticalGaps > noConnectivity && criticalGaps > noSamuiFlight) {
      signals.push({
        severity: "attention",
        category: "ops",
        messageKey: "checklist_critical_gaps",
        params: { count: criticalGaps },
        roles: ["admin", "manager", "front_desk_supervisor"],
      });
    }
  }

  // ── 🏠 STAY ESSENTIALS CHECK ──
  // Check if today's check-ins have WiFi/emergency configured (unit-level or global)
  if (arrivingToday.length > 0) {
    const arrivingUnitIds = [...new Set(arrivingToday.map((b: any) => b.id))];
    // Get units for today's arrivals
    const { data: todayBookingsWithUnits } = await adminClient
      .from("bookings")
      .select("id, unit_id, units(wifi_network, wifi_password, emergency_contact_name, emergency_contact_phone)")
      .eq("check_in", today)
      .in("state", ["confirmed", "pending_deposit"]);

    // Get global fallbacks
    const { data: essentialsPolicies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", ["wifi_network_name", "wifi_password", "emergency_contact_name", "emergency_contact_phone"]);

    const epMap = new Map((essentialsPolicies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const globalWifi = epMap.get("wifi_network_name") || "";
    const globalEmergency = epMap.get("emergency_contact_phone") || "";

    let missingCount = 0;
    let readyCount = 0;
    for (const booking of todayBookingsWithUnits ?? []) {
      const unit = (booking as any).units;
      const hasWifi = (unit?.wifi_network || globalWifi);
      const hasEmergency = (unit?.emergency_contact_phone || globalEmergency);
      if (!hasWifi || !hasEmergency) {
        missingCount++;
      } else {
        readyCount++;
      }
    }

    if (missingCount > 0) {
      signals.push({
        severity: "attention",
        category: "ops",
        messageKey: "essentials_missing",
        params: { count: missingCount },
        roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
      });
    } else if (readyCount > 0) {
      signals.push({
        severity: "normal",
        category: "ops",
        messageKey: "essentials_ready",
        params: { count: readyCount },
        roles: ["admin", "manager", "front_desk"],
        isUpcoming: true,
      });
    }
  }

  // ── UPCOMING ──

  const arrTomorrow = arrivingTomorrowRes.count ?? 0;
  if (arrTomorrow > 0) {
    signals.push({
      severity: "normal",
      category: "time",
      messageKey: "upcoming_arrivals",
      params: { count: arrTomorrow },
      roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
      isUpcoming: true,
    });
  }

  const depTomorrow = departingTomorrowRes.count ?? 0;
  if (depTomorrow > 0) {
    signals.push({
      severity: "normal",
      category: "time",
      messageKey: "upcoming_departures",
      params: { count: depTomorrow },
      roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
      isUpcoming: true,
    });
  }

  const upcomingBlocks = upcomingBlocksRes.data ?? [];
  for (const block of upcomingBlocks) {
    if (block.start_date !== today) {
      signals.push({
        severity: "normal",
        category: "ops",
        messageKey: "upcoming_maintenance_block",
        params: { date: block.start_date, unit: (block as any).units?.name || "Unknown" },
        roles: ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance"],
        isUpcoming: true,
      });
    }
  }

  return signals;
}

// ─── ROLE FILTER ─────────────────────────────────────────────────────────────

function filterByRole(signals: Signal[], role: string): Signal[] {
  const allowedCategories = ROLE_CATEGORIES[role] || [];
  return signals.filter(
    (s) => s.roles.includes(role) && allowedCategories.includes(s.category)
  );
}

// ─── PRIORITY ENGINE ─────────────────────────────────────────────────────────

interface CornerTalkOutput {
  attention: Array<{ text: string; severity: Severity; messageKey: string }>;
  upcoming: Array<{ text: string; messageKey: string }>;
  allClear: boolean;
  generatedAt: string;
}

function buildOutput(signals: Signal[]): CornerTalkOutput {
  const attentionSignals = signals
    .filter((s) => !s.isUpcoming)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 5);

  const upcomingSignals = signals
    .filter((s) => s.isUpcoming)
    .slice(0, 3);

  const attention = attentionSignals.map((s) => ({
    text: renderMessage(s.messageKey, s.params),
    severity: s.severity,
    messageKey: s.messageKey,
  }));

  const upcoming = upcomingSignals.map((s) => ({
    text: renderMessage(s.messageKey, s.params),
    messageKey: s.messageKey,
  }));

  return {
    attention,
    upcoming,
    allClear: attention.length === 0,
    generatedAt: new Date().toISOString(),
  };
}

// ─── MULTI-LANGUAGE TRANSLATION ──────────────────────────────────────────────

async function translateOutput(
  output: CornerTalkOutput,
  language: string,
  lovableApiKey: string
): Promise<CornerTalkOutput> {
  // Skip translation for English
  if (!language || language === "en" || language === "English") {
    return output;
  }

  if (output.allClear) return output;

  const allLines = [
    ...output.attention.map((a) => a.text),
    ...output.upcoming.map((u) => u.text),
  ];

  if (allLines.length === 0) return output;

  const langMap: Record<string, string> = {
    th: "Thai", fr: "French", de: "German", ru: "Russian",
    zh: "Chinese", ja: "Japanese", ko: "Korean", es: "Spanish",
  };
  const targetLang = langMap[language] || language;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Translate these operational alerts into ${targetLang}. Rules:
- Keep the same direct, casual tone. No corporate language.
- Each line stays as one short sentence.
- Numbers and unit names stay unchanged.
- Return ONLY the translated lines, one per line, in the same order.
- No extra text, no numbering, no explanations.`,
          },
          { role: "user", content: allLines.join("\n") },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("Translation failed:", resp.status);
      return output; // Fall back to English
    }

    const result = await resp.json();
    const translated = (result.choices?.[0]?.message?.content || "")
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    if (translated.length >= allLines.length) {
      const attCount = output.attention.length;
      return {
        ...output,
        attention: output.attention.map((a, i) => ({
          ...a,
          text: translated[i] || a.text,
        })),
        upcoming: output.upcoming.map((u, i) => ({
          ...u,
          text: translated[attCount + i] || u.text,
        })),
      };
    }
  } catch (e) {
    console.error("Translation error:", e);
  }

  return output; // Fall back to English on any error
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    // Verify user via JWT claims (no network call)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Get user role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .single();

    const role = roleData?.role || "guest";

    // Guests don't get Corner Talk
    if (role === "guest") {
      return new Response(
        JSON.stringify({ attention: [], upcoming: [], allClear: true, generatedAt: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { language } = await req.json().catch(() => ({ language: "en" }));

    // Check server-side cache first
    const cacheKey = `${role}:${language || "en"}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract all signals
    const allSignals = await extractSignals(adminClient);

    // Filter by role
    const roleSignals = filterByRole(allSignals, role);

    // Build structured output
    let output = buildOutput(roleSignals);

    // Translate if needed
    if (lovableApiKey && language && language !== "en") {
      output = await translateOutput(output, language, lovableApiKey);
    }

    // Cache the result
    setCache(cacheKey, output);

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("corner-talk error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
