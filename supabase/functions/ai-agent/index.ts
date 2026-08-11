// ai-agent — "Kru Glitch, deeper"  (BUSINESS-CRITICAL)
// -----------------------------------------------------------------------------
// Tool-calling ops agent for staff. Unlike `ai-assistant` (which narrates a
// pre-built context blob), this function gives the model a set of READ tools it
// can call itself, so depth is no longer capped by whatever the context builder
// happened to include.
//
// ARCHITECTURE LAW — Plan -> Approve -> Execute:
//   The agent has exactly ONE write tool, `propose_action`, and it executes
//   nothing. It writes a row into `ai_action_drafts` that a human reviews and
//   approves inside the platform. No booking, payment, inventory, or
//   guest-facing side effect can originate from this function.
//
// Staff only. Guests are rejected — they keep the scoped concierge.
//
// SCHEMA NOTES (this codebase, not generic):
//   bookings.state (not status): pending_deposit | confirmed | checked_in |
//     completed | cancelled. Guest name = profiles.full_name via guest_id, or
//     manual_guest_name for staff-entered legacy bookings.
//   bookings.hold_deadline_at is the payment/hold deadline.
//   payments: status 'recorded' means money received; payment_type buckets
//     deposit | balance | addon.
//   housekeeping_tasks: due_by + status (no scheduled_date).
//   units.listing_category is the public category.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const MODEL = "google/gemini-3.6-flash";
const MAX_STEPS = 6;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const LIVE_STATES = ["pending_deposit", "confirmed", "checked_in"];
const GUEST_JOIN = "profiles!bookings_guest_id_profiles_fkey(full_name, email)";

/** Bangkok-local YYYY-MM-DD for "today" from the property's point of view. */
function campToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function campTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Bangkok",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Booking rows carry either a linked profile or a staff-typed manual name. */
function guestNameOf(row: Record<string, any>): string {
  return (
    row.manual_guest_name ||
    row.profiles?.full_name ||
    row.profiles?.email ||
    row.manual_guest_email ||
    "Unnamed guest"
  );
}

function isReceived(status: string): boolean {
  return status === "recorded" || status === "partially_refunded";
}

/** Mirrors src/lib/paymentTypes.ts calculateOutstanding — add-ons are real money. */
function outstandingFor(
  totalPrice: number | null,
  payments: Array<{ amount: number; status: string; refund_amount?: number | null; payment_type?: string | null }>,
) {
  const paid = payments.filter((p) => isReceived(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const refunded = payments
    .filter((p) => p.status === "refunded" || p.status === "partially_refunded")
    .reduce((s, p) => s + Number(p.refund_amount ?? 0), 0);
  const addon = payments
    .filter(
      (p) =>
        (p.payment_type ?? "") === "addon" &&
        ["pending", "recorded", "partially_refunded", "waived"].includes(p.status),
    )
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const grandTotal = Math.round(((totalPrice ?? 0) + addon) * 100) / 100;
  return {
    paid: Math.round(paid * 100) / 100,
    addon_total: Math.round(addon * 100) / 100,
    grand_total: grandTotal,
    outstanding: Math.max(0, Math.round((grandTotal - paid + refunded) * 100) / 100),
  };
}

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_today_board",
      description:
        "Today's operational board: arrivals, departures, in-house count, and arrivals with no unit assigned. Use for 'what's happening today' questions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_bookings",
      description:
        "List bookings with filters. Use for a date range, a state, or a guest name search.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            description:
              "Booking state: pending_deposit, confirmed, checked_in, completed, or cancelled.",
          },
          from_date: { type: "string", description: "Earliest check-in date, YYYY-MM-DD." },
          to_date: { type: "string", description: "Latest check-in date, YYYY-MM-DD." },
          guest_name: { type: "string", description: "Partial guest name to search for." },
          limit: { type: "number", description: "Max rows, default 20, hard cap 50." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_money_exposure",
      description:
        "Live bookings with money still owed, including add-on obligations like airport pickup. Use for revenue-risk questions.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Max rows, default 25, hard cap 50." } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exceptions",
      description:
        "Everything currently off-script: expired holds, arrivals with no unit assigned, documents awaiting review, and open housekeeping past its due time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_booking_detail",
      description:
        "Full detail for one booking: dates, unit, guest, money breakdown, airport pickup, documents, and override history.",
      parameters: {
        type: "object",
        properties: { booking_id: { type: "string", description: "The booking UUID." } },
        required: ["booking_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_housekeeping",
      description: "Housekeeping / turnover tasks, optionally for a specific date (by due time).",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD, defaults to today." } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_availability",
      description:
        "Which units are free across a date range. Always call this before proposing any date or room change.",
      parameters: {
        type: "object",
        properties: {
          check_in: { type: "string", description: "YYYY-MM-DD." },
          check_out: { type: "string", description: "YYYY-MM-DD." },
        },
        required: ["check_in", "check_out"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_overrides",
      description:
        "Recent manual staff overrides from the audit log, including whether they were taken under a temporary admin elevation.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Max rows, default 15, hard cap 40." } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description:
        "Propose an operational action for a human to approve. This does NOT execute anything — it creates a draft in the platform's approval queue. Use it whenever the staff member asks you to DO something.",
      parameters: {
        type: "object",
        properties: {
          action_type: {
            type: "string",
            description:
              "One of: extend_stay, change_dates, change_room, request_payment, apply_discount, assign_housekeeping, contact_guest, flag_booking, add_internal_note, other.",
          },
          summary: {
            type: "string",
            description: "One plain-English sentence describing exactly what should happen.",
          },
          rationale: {
            type: "string",
            description: "Why you are proposing this, citing the data you read.",
          },
          booking_id: { type: "string", description: "Related booking UUID if there is one." },
          details: {
            type: "object",
            description: "Structured specifics (dates, amounts, unit, etc.).",
            properties: {},
          },
        },
        required: ["action_type", "summary", "rationale"],
      },
    },
  },
] as const;

// ─── TOOL IMPLEMENTATIONS ────────────────────────────────────────────────────
type ToolArgs = Record<string, unknown>;

function cap(n: unknown, fallback: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(Math.max(1, Math.floor(v)), max);
}

async function runTool(
  name: string,
  args: ToolArgs,
  ctx: { userId: string; role: string },
): Promise<unknown> {
  switch (name) {
    case "get_today_board": {
      const today = campToday();
      const cols = `id, check_in, check_out, state, unit_id, num_guests, manual_guest_name, manual_guest_email, units(name), ${GUEST_JOIN}`;
      const [arrivals, departures, inHouse] = await Promise.all([
        admin.from("bookings").select(cols).eq("check_in", today).in("state", LIVE_STATES),
        admin.from("bookings").select(cols).eq("check_out", today).in("state", LIVE_STATES),
        admin.from("bookings").select("id").eq("state", "checked_in"),
      ]);
      const shape = (rows: any[] | null) =>
        (rows ?? []).map((b) => ({
          booking_id: b.id,
          guest: guestNameOf(b),
          unit: b.units?.name ?? null,
          check_in: b.check_in,
          check_out: b.check_out,
          state: b.state,
          guests: b.num_guests,
        }));
      const arrivalRows = shape(arrivals.data as any[]);
      return {
        date_bangkok: today,
        arrivals: arrivalRows,
        departures: shape(departures.data as any[]),
        in_house_count: (inHouse.data ?? []).length,
        arrivals_without_unit: arrivalRows.filter((a) => !a.unit).length,
      };
    }

    case "list_bookings": {
      let q = admin
        .from("bookings")
        .select(
          `id, check_in, check_out, state, unit_id, total_price, num_guests, created_at, manual_guest_name, manual_guest_email, units(name), ${GUEST_JOIN}`,
        )
        .order("check_in", { ascending: true })
        .limit(cap(args.limit, 20, 50));
      if (typeof args.state === "string") q = q.eq("state", args.state);
      if (typeof args.from_date === "string") q = q.gte("check_in", args.from_date);
      if (typeof args.to_date === "string") q = q.lte("check_in", args.to_date);
      const { data, error } = await q;
      if (error) return { error: error.message };

      let rows = (data ?? []) as any[];
      // Guest name lives in two places (linked profile vs manual entry), so the
      // name filter is applied in memory rather than as a single SQL ilike.
      if (typeof args.guest_name === "string" && args.guest_name.trim()) {
        const needle = args.guest_name.trim().toLowerCase();
        rows = rows.filter((b) => guestNameOf(b).toLowerCase().includes(needle));
      }
      return {
        count: rows.length,
        bookings: rows.map((b) => ({
          booking_id: b.id,
          guest: guestNameOf(b),
          unit: b.units?.name ?? null,
          check_in: b.check_in,
          check_out: b.check_out,
          state: b.state,
          guests: b.num_guests,
          total_price_thb: b.total_price,
        })),
      };
    }

    case "get_money_exposure": {
      const { data, error } = await admin
        .from("bookings")
        .select(
          `id, check_in, check_out, state, total_price, hold_deadline_at, pay_on_arrival, manual_guest_name, manual_guest_email, units(name), ${GUEST_JOIN}`,
        )
        .in("state", LIVE_STATES)
        .order("check_in", { ascending: true })
        .limit(cap(args.limit, 25, 50));
      if (error) return { error: error.message };

      const rows = (data ?? []) as any[];
      const ids = rows.map((b) => b.id);
      const { data: payments } = ids.length
        ? await admin
            .from("payments")
            .select("booking_id, amount, status, payment_type, refund_amount")
            .in("booking_id", ids)
        : { data: [] as any[] };
      const byBooking = new Map<string, any[]>();
      for (const p of (payments ?? []) as any[]) {
        const list = byBooking.get(p.booking_id) ?? [];
        list.push(p);
        byBooking.set(p.booking_id, list);
      }

      const out = rows
        .map((b) => {
          const money = outstandingFor(b.total_price, byBooking.get(b.id) ?? []);
          return {
            booking_id: b.id,
            guest: guestNameOf(b),
            unit: b.units?.name ?? null,
            check_in: b.check_in,
            state: b.state,
            pay_on_arrival: !!b.pay_on_arrival,
            hold_deadline: campTime(b.hold_deadline_at),
            hold_expired:
              !!b.hold_deadline_at && new Date(b.hold_deadline_at).getTime() < Date.now(),
            ...money,
          };
        })
        .filter((r) => r.outstanding > 0);

      return {
        note:
          "Amounts in THB. pay_on_arrival = true means the guest settles at the camp; that is expected, not overdue.",
        total_outstanding_thb: Math.round(out.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
        rows: out,
      };
    }

    case "get_exceptions": {
      const today = campToday();
      const nowIso = new Date().toISOString();
      const cols = `id, check_in, check_out, state, hold_deadline_at, manual_guest_name, manual_guest_email, units(name), ${GUEST_JOIN}`;
      const [expired, unassigned, docs, hk] = await Promise.all([
        admin
          .from("bookings")
          .select(cols)
          .eq("state", "pending_deposit")
          .lt("hold_deadline_at", nowIso)
          .limit(25),
        admin
          .from("bookings")
          .select(cols)
          .is("unit_id", null)
          .gte("check_in", today)
          .in("state", LIVE_STATES)
          .limit(25),
        admin
          .from("guest_documents")
          .select("id, booking_id, document_type, review_status, created_at")
          .eq("review_status", "pending")
          .limit(25),
        admin
          .from("housekeeping_tasks")
          .select("id, unit_id, status, due_by, notes")
          .neq("status", "completed")
          .lt("due_by", nowIso)
          .limit(25),
      ]);
      const shape = (rows: any[] | null) =>
        (rows ?? []).map((b) => ({
          booking_id: b.id,
          guest: guestNameOf(b),
          unit: b.units?.name ?? null,
          check_in: b.check_in,
          state: b.state,
          hold_deadline: campTime(b.hold_deadline_at),
        }));
      return {
        expired_holds: shape(expired.data as any[]),
        arrivals_without_unit: shape(unassigned.data as any[]),
        documents_awaiting_review: (docs.data ?? []).map((d: any) => ({
          document_id: d.id,
          booking_id: d.booking_id,
          type: d.document_type,
          uploaded: campTime(d.created_at),
        })),
        housekeeping_overdue: (hk.data ?? []).map((t: any) => ({
          task_id: t.id,
          unit_id: t.unit_id,
          status: t.status,
          due: campTime(t.due_by),
        })),
      };
    }

    case "get_booking_detail": {
      const id = String(args.booking_id ?? "");
      if (!id) return { error: "booking_id required" };
      const [booking, payments, overrides, pickup, docs] = await Promise.all([
        admin
          .from("bookings")
          .select(
            `id, check_in, check_out, state, num_guests, total_price, price_override, notes, guest_type, pay_on_arrival, offline_acknowledgements, hold_deadline_at, deadline_override_reason, confirmation_number, flight_number, arrived_at, manual_guest_name, manual_guest_email, manual_guest_phone, units(name, listing_category), ${GUEST_JOIN}`,
          )
          .eq("id", id)
          .maybeSingle(),
        admin
          .from("payments")
          .select("amount, status, payment_type, method, refund_amount, created_at")
          .eq("booking_id", id),
        admin
          .from("override_audit_log")
          .select("action_type, actor_name, actor_role, reason, created_at, elevated")
          .eq("booking_id", id)
          .order("created_at", { ascending: false })
          .limit(15),
        admin
          .from("airport_pickups")
          .select(
            "status, fee, flight_number, arrival_datetime, arrival_type, arrival_location_name, guest_landed_at, pickup_enabled",
          )
          .eq("booking_id", id)
          .maybeSingle(),
        admin
          .from("guest_documents")
          .select("document_type, review_status, used_for_tm30, created_at")
          .eq("booking_id", id)
          .eq("superseded", false),
      ]);
      const b = booking.data as any;
      if (!b) return { error: "Booking not found" };
      return {
        booking_id: b.id,
        guest: guestNameOf(b),
        unit: b.units?.name ?? null,
        category: b.units?.listing_category ?? null,
        check_in: b.check_in,
        check_out: b.check_out,
        state: b.state,
        guests: b.num_guests,
        pay_on_arrival: !!b.pay_on_arrival,
        offline_acknowledgements: b.offline_acknowledgements ?? null,
        hold_deadline: campTime(b.hold_deadline_at),
        deadline_override_reason: b.deadline_override_reason ?? null,
        confirmation_number: b.confirmation_number ?? null,
        notes: b.notes ?? null,
        money: outstandingFor(b.total_price, (payments.data ?? []) as any[]),
        payments: (payments.data ?? []).map((p: any) => ({
          amount_thb: p.amount,
          status: p.status,
          type: p.payment_type,
          method: p.method,
          when: campTime(p.created_at),
        })),
        pickup: pickup.data
          ? {
              ...(pickup.data as any),
              arrival_time: campTime((pickup.data as any).arrival_datetime),
            }
          : null,
        documents: docs.data ?? [],
        overrides: (overrides.data ?? []).map((o: any) => ({
          ...o,
          when: campTime(o.created_at),
        })),
      };
    }

    case "get_housekeeping": {
      const date = typeof args.date === "string" ? args.date : campToday();
      // due_by is a timestamp; bound it to the Bangkok-local calendar day.
      const dayStart = `${date}T00:00:00+07:00`;
      const dayEnd = `${date}T23:59:59+07:00`;
      const { data, error } = await admin
        .from("housekeeping_tasks")
        .select("id, unit_id, status, due_by, notes, assigned_to, booking_out_id, booking_in_id")
        .gte("due_by", dayStart)
        .lte("due_by", dayEnd)
        .limit(60);
      if (error) return { error: error.message };
      return {
        date,
        tasks: (data ?? []).map((t: any) => ({
          task_id: t.id,
          unit_id: t.unit_id,
          status: t.status,
          due: campTime(t.due_by),
          notes: t.notes,
          turnover: !!(t.booking_out_id && t.booking_in_id),
        })),
      };
    }

    case "get_availability": {
      const checkIn = String(args.check_in ?? "");
      const checkOut = String(args.check_out ?? "");
      if (!checkIn || !checkOut) return { error: "check_in and check_out required" };
      const [units, overlapping] = await Promise.all([
        admin
          .from("units")
          .select("id, name, listing_category, group_id, capacity")
          .eq("is_active", true),
        // Overlap semantics: a stay conflicts when it starts before our checkout
        // and ends after our check-in. Same-day turnover is NOT a conflict.
        admin
          .from("bookings")
          .select("unit_id")
          .in("state", LIVE_STATES)
          .lt("check_in", checkOut)
          .gt("check_out", checkIn),
      ]);
      const taken = new Set(((overlapping.data ?? []) as any[]).map((b) => b.unit_id).filter(Boolean));
      const free = ((units.data ?? []) as any[]).filter((u) => !taken.has(u.id));
      return {
        range: { check_in: checkIn, check_out: checkOut },
        free_units: free.map((u) => ({
          unit_id: u.id,
          name: u.name,
          category: u.listing_category,
          capacity: u.capacity,
        })),
        occupied_count: taken.size,
      };
    }

    case "get_recent_overrides": {
      const { data, error } = await admin
        .from("override_audit_log")
        .select(
          "action_type, target_type, actor_name, actor_role, reason, created_at, elevated, attribution_missing",
        )
        .order("created_at", { ascending: false })
        .limit(cap(args.limit, 15, 40));
      if (error) return { error: error.message };
      return {
        overrides: (data ?? []).map((o: any) => ({ ...o, when: campTime(o.created_at) })),
      };
    }

    case "propose_action": {
      const actionType = String(args.action_type ?? "other");
      const summary = String(args.summary ?? "").trim();
      const rationale = String(args.rationale ?? "").trim();
      if (!summary) return { error: "summary required" };

      let propertyId: string | null = null;
      const bookingId = typeof args.booking_id === "string" && args.booking_id ? args.booking_id : null;
      if (bookingId) {
        const { data: b } = await admin
          .from("bookings")
          .select("property_id")
          .eq("id", bookingId)
          .maybeSingle();
        propertyId = (b as any)?.property_id ?? null;
      }

      const { data, error } = await admin
        .from("ai_action_drafts")
        .insert({
          created_by_user_id: ctx.userId,
          action_type: actionType,
          summary,
          rationale,
          booking_id: bookingId,
          property_id: propertyId,
          payload: (args.details as Record<string, unknown>) ?? {},
          status: "pending",
        })
        .select("id")
        .single();

      if (error) return { error: error.message };
      return {
        drafted: true,
        draft_id: data.id,
        note:
          "Draft created in the approval queue. Nothing was executed. Tell the staff member it is waiting for their approval.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function buildSystemPrompt(role: string, langName: string): string {
  return `You are Kru Glitch, the operations intelligence for LMT CampStay (Lamai Muay Thai, Koh Samui, Thailand).

WHO YOU ARE TALKING TO: a staff member with the role "${role}".
LANGUAGE: reply in ${langName}. Match the user's language if they switch.

HOW YOU WORK
- You have read tools. USE THEM. Never guess at numbers, dates, names, or money — call a tool and answer from what it returned.
- Chain tools when needed: check availability before suggesting a room move; read the booking before proposing anything about it.
- All times are Thailand time (UTC+7). Money is Thai Baht (THB).
- Booking states here are: pending_deposit, confirmed, checked_in, completed, cancelled.
- A booking marked pay_on_arrival settles at the camp — do NOT call it overdue.

ACTIONS — PLAN, APPROVE, EXECUTE
- You cannot execute anything. Ever. If the staff member asks you to do something operational, call propose_action to put a draft in the approval queue, then say plainly that it is waiting for approval and what it will do.
- Never claim something has been done, sent, charged, booked, or changed. It has not.
- Do not propose an action you have not verified with a read tool first.

STYLE
- Brevity first. Lead with the answer. No preamble, no "Great question", no filler.
- Short lines and tight lists. Staff read this on a phone while walking.
- Flag risk explicitly: money owed, missing documents, an arrival with no unit assigned.
- If a tool returns nothing, say so. Never invent a fallback answer.`;
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    // ── Auth: staff only ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { data: canRead } = await admin.rpc("has_ops_read", { _user_id: userId });
    if (!canRead) return json({ error: "Staff access required" }, 403);

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = ((roleRows ?? []) as any[]).map((r) => r.role as string);
    const role =
      ["admin", "manager", "front_desk_supervisor", "front_desk"].find((r) => roles.includes(r)) ??
      roles[0] ??
      "staff";

    const body = await req.json().catch(() => ({}));
    const messages: Array<Record<string, unknown>> = Array.isArray(body.messages)
      ? body.messages.slice(-20)
      : [];
    const langName = typeof body.language === "string" ? body.language : "English";
    if (messages.length === 0) return json({ error: "No messages" }, 400);

    // ── Tool-calling loop ───────────────────────────────────────────────────
    const convo: Array<Record<string, unknown>> = [
      { role: "system", content: buildSystemPrompt(role, langName) },
      ...messages,
    ];
    const toolsUsed: string[] = [];
    const draftIds: string[] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: convo,
          tools: TOOLS,
          stream: false,
          max_tokens: 900,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("ai-agent gateway error", res.status, detail);
        if (res.status === 429) return json({ error: "Rate limit exceeded" }, 429);
        if (res.status === 402) return json({ error: "AI credits exhausted" }, 402);
        return json({ error: "AI gateway error", detail: detail.slice(0, 300) }, 502);
      }

      const result = await res.json();
      const message = result.choices?.[0]?.message;
      if (!message) return json({ error: "Empty AI response" }, 502);

      const calls = message.tool_calls;
      if (!calls || calls.length === 0) {
        return json({
          reply: message.content ?? "",
          tools_used: toolsUsed,
          draft_ids: draftIds,
        });
      }

      convo.push(message);

      for (const call of calls) {
        const name = call.function?.name as string;
        let parsed: ToolArgs = {};
        try {
          parsed = JSON.parse(call.function?.arguments || "{}");
        } catch {
          parsed = {};
        }
        toolsUsed.push(name);
        let output: unknown;
        try {
          output = await runTool(name, parsed, { userId, role });
        } catch (e) {
          console.error(`tool ${name} failed`, e);
          output = { error: e instanceof Error ? e.message : "Tool failed" };
        }
        if (name === "propose_action" && output && typeof output === "object" && "draft_id" in output) {
          draftIds.push(String((output as { draft_id: string }).draft_id));
        }
        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output).slice(0, 12_000),
        });
      }
    }

    return json({
      reply:
        "I gathered a lot of data but ran out of steps before finishing. Ask me something narrower and I'll get straight to it.",
      tools_used: toolsUsed,
      draft_ids: draftIds,
    });
  } catch (e) {
    console.error("ai-agent failure", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
