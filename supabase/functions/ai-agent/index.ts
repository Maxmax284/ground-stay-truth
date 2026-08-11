// ai-agent — "Kru Glitch, deeper"  (BUSINESS-CRITICAL)
// -----------------------------------------------------------------------------
// Tool-calling ops agent for staff. Unlike `ai-assistant` (which narrates a
// pre-built context blob), this function gives the model a set of READ tools it
// can call itself, so depth is no longer capped by whatever the context builder
// happened to include.
//
// ARCHITECTURE LAW — Plan -> Approve -> Execute:
//   The agent has exactly ONE write tool, `propose_action`, and it does not
//   execute anything. It writes a row into `ai_action_drafts` that a human
//   reviews and approves inside the platform. No booking, payment, inventory,
//   or guest-facing side effect can originate from this function.
//
// Staff only. Guests are rejected — they keep the scoped concierge.
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

/** Bangkok-local YYYY-MM-DD for "today" from the property's point of view. */
function campToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function campTime(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Bangkok",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────────────
// Read tools are safe by construction: they only SELECT, always bounded, and
// never return raw contact details for guests (staff can open the record).
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_today_board",
      description:
        "Today's operational board: arrivals, departures, in-house count, and unassigned units. Use this for 'what's happening today' style questions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_bookings",
      description:
        "List bookings with filters. Use for questions about a date range, a status, or a specific guest name.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Booking status filter, e.g. pending, confirmed, checked_in, checked_out, cancelled, no_show.",
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
        "Bookings with money still owed: outstanding balances, unpaid deposits, and overdue payment deadlines. Use for revenue-risk questions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max rows, default 20, hard cap 50." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exceptions",
      description:
        "Everything currently off-script: expired holds, missing documents, unassigned units, arrivals with no flight info, no-shows awaiting a decision.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_booking_detail",
      description:
        "Full detail for one booking: dates, unit, guests, money, pickup, documents, and its override history.",
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
      description: "Housekeeping and turnover tasks, optionally for a specific date.",
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
        "Which units are free across a date range. Use before proposing any date or room change.",
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
      const [arrivals, departures, inHouse] = await Promise.all([
        admin
          .from("bookings")
          .select("id, guest_name, check_in, check_out, status, unit_id, num_guests")
          .eq("check_in", today)
          .not("status", "in", "(cancelled,no_show)"),
        admin
          .from("bookings")
          .select("id, guest_name, check_in, check_out, status, unit_id")
          .eq("check_out", today)
          .not("status", "in", "(cancelled,no_show)"),
        admin
          .from("bookings")
          .select("id, guest_name, check_in, check_out, unit_id")
          .eq("status", "checked_in"),
      ]);
      return {
        date_bangkok: today,
        arrivals: arrivals.data ?? [],
        departures: departures.data ?? [],
        in_house_count: (inHouse.data ?? []).length,
        arrivals_without_unit: (arrivals.data ?? []).filter((b) => !b.unit_id).length,
      };
    }

    case "list_bookings": {
      let q = admin
        .from("bookings")
        .select(
          "id, guest_name, check_in, check_out, status, unit_id, total_price, num_guests, created_at",
        )
        .order("check_in", { ascending: true })
        .limit(cap(args.limit, 20, 50));
      if (typeof args.status === "string") q = q.eq("status", args.status);
      if (typeof args.from_date === "string") q = q.gte("check_in", args.from_date);
      if (typeof args.to_date === "string") q = q.lte("check_in", args.to_date);
      if (typeof args.guest_name === "string" && args.guest_name.trim()) {
        q = q.ilike("guest_name", `%${args.guest_name.trim()}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: (data ?? []).length, bookings: data ?? [] };
    }

    case "get_money_exposure": {
      const limit = cap(args.limit, 20, 50);
      const { data, error } = await admin
        .from("bookings")
        .select(
          "id, guest_name, check_in, check_out, status, total_price, deposit_paid, payment_deadline, pay_on_arrival",
        )
        .not("status", "in", "(cancelled,no_show,checked_out)")
        .order("check_in", { ascending: true })
        .limit(limit);
      if (error) return { error: error.message };
      const ids = (data ?? []).map((b) => b.id);
      const { data: payments } = ids.length
        ? await admin.from("payments").select("booking_id, amount, status, kind").in("booking_id", ids)
        : { data: [] as Array<Record<string, unknown>> };
      const paidBy = new Map<string, number>();
      for (const p of payments ?? []) {
        if ((p as { status?: string }).status !== "paid") continue;
        const bid = (p as { booking_id: string }).booking_id;
        paidBy.set(bid, (paidBy.get(bid) ?? 0) + Number((p as { amount: number }).amount ?? 0));
      }
      return {
        note: "Amounts in THB. pay_on_arrival bookings are expected to settle at the camp — not overdue.",
        rows: (data ?? []).map((b) => ({
          ...b,
          paid_total: paidBy.get(b.id) ?? 0,
          outstanding: Number(b.total_price ?? 0) - (paidBy.get(b.id) ?? 0),
        })),
      };
    }

    case "get_exceptions": {
      const today = campToday();
      const [expired, unassigned, docs, noShows] = await Promise.all([
        admin
          .from("bookings")
          .select("id, guest_name, check_in, status, payment_deadline")
          .eq("status", "pending")
          .lt("payment_deadline", new Date().toISOString())
          .limit(25),
        admin
          .from("bookings")
          .select("id, guest_name, check_in, status")
          .is("unit_id", null)
          .gte("check_in", today)
          .not("status", "in", "(cancelled,no_show)")
          .limit(25),
        admin
          .from("guest_documents")
          .select("id, booking_id, document_type, status, created_at")
          .eq("status", "pending")
          .limit(25),
        admin
          .from("bookings")
          .select("id, guest_name, check_in, status")
          .eq("status", "no_show")
          .limit(25),
      ]);
      return {
        expired_holds: expired.data ?? [],
        arrivals_without_unit: unassigned.data ?? [],
        documents_awaiting_review: docs.data ?? [],
        no_shows_awaiting_decision: noShows.data ?? [],
      };
    }

    case "get_booking_detail": {
      const id = String(args.booking_id ?? "");
      if (!id) return { error: "booking_id required" };
      const [booking, payments, overrides, pickup] = await Promise.all([
        admin.from("bookings").select("*").eq("id", id).maybeSingle(),
        admin.from("payments").select("amount, status, kind, created_at").eq("booking_id", id),
        admin
          .from("override_audit_log")
          .select("action_type, actor_name, actor_role, reason, created_at, elevated")
          .eq("booking_id", id)
          .order("created_at", { ascending: false })
          .limit(15),
        admin.from("airport_pickups").select("*").eq("booking_id", id).maybeSingle(),
      ]);
      if (!booking.data) return { error: "Booking not found" };
      return {
        booking: booking.data,
        payments: payments.data ?? [],
        pickup: pickup.data ?? null,
        overrides: (overrides.data ?? []).map((o) => ({
          ...o,
          when: campTime(o.created_at as string),
        })),
      };
    }

    case "get_housekeeping": {
      const date = typeof args.date === "string" ? args.date : campToday();
      const { data, error } = await admin
        .from("housekeeping_tasks")
        .select("id, unit_id, task_type, status, scheduled_date, notes")
        .eq("scheduled_date", date)
        .limit(60);
      if (error) return { error: error.message };
      return { date, tasks: data ?? [] };
    }

    case "get_availability": {
      const checkIn = String(args.check_in ?? "");
      const checkOut = String(args.check_out ?? "");
      if (!checkIn || !checkOut) return { error: "check_in and check_out required" };
      const [units, overlapping] = await Promise.all([
        admin.from("units").select("id, name, category, group_id, is_active").eq("is_active", true),
        admin
          .from("bookings")
          .select("unit_id, check_in, check_out, status")
          .not("status", "in", "(cancelled,no_show)")
          .lt("check_in", checkOut)
          .gt("check_out", checkIn),
      ]);
      const taken = new Set((overlapping.data ?? []).map((b) => b.unit_id).filter(Boolean));
      const free = (units.data ?? []).filter((u) => !taken.has(u.id));
      return {
        range: { check_in: checkIn, check_out: checkOut },
        free_units: free.map((u) => ({ id: u.id, name: u.name, category: u.category })),
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
        overrides: (data ?? []).map((o) => ({ ...o, when: campTime(o.created_at as string) })),
      };
    }

    case "propose_action": {
      const actionType = String(args.action_type ?? "other");
      const summary = String(args.summary ?? "").trim();
      const rationale = String(args.rationale ?? "").trim();
      if (!summary) return { error: "summary required" };

      const { data, error } = await admin
        .from("ai_action_drafts")
        .insert({
          created_by_user_id: ctx.userId,
          action_type: actionType,
          summary,
          rationale,
          booking_id: typeof args.booking_id === "string" ? args.booking_id : null,
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
          "Draft created in the approval queue. Nothing has been executed. Tell the staff member it is waiting for their approval.",
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
- You have read tools. USE THEM. Never guess at numbers, dates, names, or money — call a tool and cite what it returned.
- Chain tools when needed: check availability before suggesting a room move; read the booking before proposing anything about it.
- All times are Thailand time (UTC+7). Money is Thai Baht (THB).

ACTIONS — PLAN, APPROVE, EXECUTE
- You cannot execute anything. Ever. If the staff member asks you to do something operational, call propose_action to put a draft in the approval queue, then tell them plainly it is waiting for approval and what it will do.
- Never claim something has been done, sent, charged, booked, or changed. It hasn't.
- Do not propose an action you have not verified with a read tool first.

STYLE
- Brevity first. Lead with the answer. No preamble, no "Great question", no filler.
- Short lines and tight lists. A staff member is reading this on a phone while walking.
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

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const role = (roleRow?.role as string) ?? "front_desk";

    const body = await req.json().catch(() => ({}));
    const messages: Array<Record<string, unknown>> = Array.isArray(body.messages)
      ? body.messages
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
        if (
          name === "propose_action" &&
          output &&
          typeof output === "object" &&
          "draft_id" in output
        ) {
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
