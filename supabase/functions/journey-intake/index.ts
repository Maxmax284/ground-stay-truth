// journey-intake
// -----------------------------------------------------------------------------
// Stage 2 of Guest Arrival Intelligence: how travel details get IN.
//
// Two ways in:
//   save_legs        — a person types their journey (guest or staff).
//   extract_evidence — a booking screenshot/confirmation is read for them.
//
// Hard rules (enforced here, not just documented):
//   - Enrich only. A blank field may be filled. A field a person already set is
//     never overwritten — it becomes an open row in `arrival_conflicts`.
//   - Never writes bookings, payments, units, pickups, prices or check-in state.
//   - An international arrival is never assumed to be the arrival in Koh Samui.
//   - Booking references are stored MASKED. The raw value is never persisted.
//   - Guests may only touch their own booking.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "https://www.lmtcampstay.com",
  "https://lmtcampstay.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

const MODEL = "google/gemini-2.5-flash";
const SAMUI_CODES = ["USM", "SAMUI", "NATHON", "MAENAM", "BIGBUDDHA", "LIPANOI"];
const LEG_TYPES = ["flight", "ferry", "bus", "road", "other"];

const SOURCE_RANK: Record<string, number> = {
  inferred: 1,
  evidence_extracted: 2,
  provider: 3,
  guest_stated: 4,
  guest_reported: 5,
  staff_entered: 6,
};

const MERGEABLE = [
  "leg_type",
  "marketed_flight_number",
  "operating_flight_number",
  "marketed_carrier",
  "operating_carrier",
  "from_code",
  "to_code",
  "from_name",
  "to_name",
  "scheduled_departure",
  "scheduled_arrival",
] as const;

const CONSEQUENTIAL = new Set(["to_code", "scheduled_arrival", "operating_flight_number", "marketed_flight_number", "leg_type"]);

// Explicit, small codeshare table for this route. Unknown numbers resolve to
// null rather than to a guess.
const KNOWN_CODESHARES: Record<string, { operating: string; carrier: string }> = {
  TG6285: { operating: "BR3", carrier: "EVA Air" },
  TG6287: { operating: "BR7", carrier: "EVA Air" },
};

function flightNo(value?: string | null): string | null {
  if (!value) return null;
  const out = String(value).replace(/\s+/g, "").toUpperCase();
  return out.length ? out : null;
}

function code(value?: string | null): string | null {
  if (!value) return null;
  const out = String(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return out.length ? out : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function legType(value: unknown): string {
  const v = String(value ?? "").toLowerCase();
  return LEG_TYPES.includes(v) ? v : "flight";
}

function isSamui(value?: string | null): boolean {
  const c = code(value);
  return !!c && SAMUI_CODES.includes(c);
}

function maskReference(reference?: string | null): string | null {
  const raw = String(reference ?? "").replace(/\s+/g, "").toUpperCase();
  if (!raw) return null;
  if (raw.length <= 3) return "•".repeat(raw.length);
  return `${"•".repeat(Math.max(3, raw.length - 3))}${raw.slice(-3)}`;
}

function blank(v: unknown) {
  return v === null || v === undefined || String(v).trim() === "";
}

function same(field: string, a: unknown, b: unknown): boolean {
  if (String(a).trim().toUpperCase() === String(b).trim().toUpperCase()) return true;
  if (field === "scheduled_arrival" || field === "scheduled_departure") {
    const ma = Date.parse(String(a));
    const mb = Date.parse(String(b));
    if (Number.isFinite(ma) && Number.isFinite(mb)) return Math.abs(ma - mb) / 60000 < 15;
  }
  return false;
}

interface MergeOut {
  updates: Record<string, unknown>;
  conflicts: Array<Record<string, unknown>>;
}

/** Fill blanks, raise questions. Never an overwrite. */
function mergeLeg(existing: Record<string, unknown>, incoming: Record<string, unknown>, incomingSource: string): MergeOut {
  const updates: Record<string, unknown> = {};
  const conflicts: Array<Record<string, unknown>> = [];
  const existingSource = String(existing.source ?? "unknown");

  for (const field of MERGEABLE) {
    const after = incoming[field];
    if (blank(after)) continue;
    const before = existing[field];
    if (blank(before)) {
      updates[field] = after;
      continue;
    }
    if (same(field, before, after)) continue;

    const consequential = CONSEQUENTIAL.has(field);
    const machineVsHuman = (SOURCE_RANK[incomingSource] ?? 0) <= (SOURCE_RANK[existingSource] ?? 0);
    conflicts.push({
      booking_id: existing.booking_id,
      leg_id: existing.id,
      field_name: field,
      existing_value: String(before),
      existing_source: existingSource,
      incoming_value: String(after),
      incoming_source: incomingSource,
      severity: consequential ? "critical" : machineVsHuman ? "warning" : "info",
      note: consequential
        ? "This changes where or when we meet the guest. A person confirms it."
        : machineVsHuman
          ? "This disagrees with what a person entered. A person decides."
          : "New reading differs from a lower-confidence value.",
    });
  }

  return { updates, conflicts };
}

function pickFinalOrder(legs: Array<{ leg_order: number; to_code?: string | null }>): number | null {
  if (!legs.length) return null;
  const ordered = [...legs].sort((a, b) => a.leg_order - b.leg_order);
  const island = [...ordered].reverse().find((l) => isSamui(l.to_code));
  return (island ?? ordered[ordered.length - 1]).leg_order;
}

/** Same aircraft, same fact. Codeshare numbers converge on the operating one. */
function flightKey(operating: string | null, marketed: string | null, date: string, arrival: string | null): string | null {
  const number = operating ?? marketed;
  if (!number || !date) return null;
  return `${number}:${date}:${(arrival ?? "ANY").toUpperCase()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors(req) });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const bookingId = String(body?.booking_id ?? "");
    if (!bookingId) {
      return new Response(JSON.stringify({ error: "booking_id required" }), { status: 400, headers: cors(req) });
    }

    // ── Who is asking, and may they touch this booking? ───────────────────────
    const { data: booking } = await admin
      .from("bookings")
      .select("id, guest_id, check_in")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: cors(req) });
    }

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "manager", "front_desk_supervisor", "front_desk"]);
    const isStaff = !!roles?.length;
    const isOwner = booking.guest_id === user.id;
    if (!isStaff && !isOwner) {
      return new Response(JSON.stringify({ error: "Not your booking" }), { status: 403, headers: cors(req) });
    }
    const actorSource = isStaff ? "staff_entered" : "guest_stated";

    // ── save_legs: a person typed their journey ───────────────────────────────
    if (action === "save_legs") {
      const incomingLegs: Array<Record<string, unknown>> = Array.isArray(body?.legs) ? body.legs : [];
      if (!incomingLegs.length) {
        return new Response(JSON.stringify({ error: "legs required" }), { status: 400, headers: cors(req) });
      }
      if (incomingLegs.length > 8) {
        return new Response(JSON.stringify({ error: "Too many legs" }), { status: 400, headers: cors(req) });
      }

      const normalized = incomingLegs.map((raw, index) => {
        const marketed = flightNo(raw.marketed_flight_number as string);
        const known = marketed ? KNOWN_CODESHARES[marketed] : undefined;
        return {
          leg_order: Number(raw.leg_order ?? index + 1) || index + 1,
          leg_type: legType(raw.leg_type),
          marketed_flight_number: marketed,
          operating_flight_number: flightNo(raw.operating_flight_number as string) ?? known?.operating ?? null,
          operating_carrier: (raw.operating_carrier as string) ?? known?.carrier ?? null,
          marketed_carrier: (raw.marketed_carrier as string) ?? null,
          from_code: code(raw.from_code as string),
          to_code: code(raw.to_code as string),
          from_name: (raw.from_name as string) ?? null,
          to_name: (raw.to_name as string) ?? null,
          scheduled_departure: iso(raw.scheduled_departure),
          scheduled_arrival: iso(raw.scheduled_arrival),
          notes: (raw.notes as string) ?? null,
        };
      });

      const { data: existingLegs } = await admin.from("journey_legs").select("*").eq("booking_id", bookingId);
      const byOrder = new Map<number, Record<string, unknown>>();
      (existingLegs ?? []).forEach((l: any) => byOrder.set(l.leg_order, l));

      const conflicts: Array<Record<string, unknown>> = [];
      let created = 0;
      let updated = 0;

      for (const leg of normalized) {
        const existing = byOrder.get(leg.leg_order);
        if (!existing) {
          const { error } = await admin.from("journey_legs").insert({
            booking_id: bookingId,
            ...leg,
            source: actorSource,
            confidence: "high",
            recorded_by: user.id,
            is_final_leg: false,
          });
          if (error) throw error;
          created += 1;
          continue;
        }

        const merged = mergeLeg(existing, leg, actorSource);
        // A person correcting their OWN stated detail is a correction, not a
        // conflict — staff facts still stand until a human resolves them.
        const canCorrect = (SOURCE_RANK[actorSource] ?? 0) >= (SOURCE_RANK[String(existing.source)] ?? 0);
        const directUpdates: Record<string, unknown> = { ...merged.updates };
        if (canCorrect) {
          for (const c of merged.conflicts) directUpdates[String(c.field_name)] = c.incoming_value;
        } else {
          conflicts.push(...merged.conflicts);
        }

        if (Object.keys(directUpdates).length) {
          const { error } = await admin
            .from("journey_legs")
            .update({ ...directUpdates, source: actorSource, recorded_by: user.id, updated_at: new Date().toISOString() })
            .eq("id", existing.id as string);
          if (error) throw error;
          updated += 1;
        }
      }

      // Remove legs the person dropped from their journey (their own only).
      const keptOrders = new Set(normalized.map((l) => l.leg_order));
      for (const [order, leg] of byOrder) {
        if (keptOrders.has(order)) continue;
        const ownSource = String(leg.source);
        if (!isStaff && !["guest_stated", "guest_reported", "evidence_extracted", "inferred"].includes(ownSource)) continue;
        await admin.from("journey_legs").delete().eq("id", leg.id as string);
      }

      await stampFinalLeg(admin, bookingId);
      const recorded = await recordConflicts(admin, conflicts);

      return new Response(
        JSON.stringify({
          ok: true,
          created,
          updated,
          conflicts: recorded,
          needs_onward: await needsOnward(admin, bookingId),
        }),
        { headers: cors(req) },
      );
    }

    // ── extract_evidence: read a screenshot / confirmation ────────────────────
    if (action === "extract_evidence") {
      const storagePath = String(body?.storage_path ?? "");
      const mime = String(body?.mime_type ?? "image/jpeg");
      const kind = ["screenshot", "confirmation", "other"].includes(String(body?.kind)) ? String(body?.kind) : "screenshot";
      if (!storagePath) {
        return new Response(JSON.stringify({ error: "storage_path required" }), { status: 400, headers: cors(req) });
      }
      // Path discipline: evidence must live under this booking's own folder.
      if (!storagePath.startsWith(`${bookingId}/`)) {
        return new Response(JSON.stringify({ error: "Evidence path does not belong to this booking" }), { status: 403, headers: cors(req) });
      }

      const { data: evidenceRow, error: evidenceError } = await admin
        .from("journey_evidence")
        .insert({
          booking_id: bookingId,
          uploaded_by: user.id,
          uploader_role: isStaff ? "staff" : "guest",
          kind,
          storage_path: storagePath,
          mime_type: mime,
          file_size: Number(body?.file_size ?? 0) || null,
        })
        .select("id")
        .single();
      if (evidenceError) throw evidenceError;
      const evidenceId = evidenceRow.id as string;

      const fail = async (message: string, status: string) => {
        await admin
          .from("journey_evidence")
          .update({ extraction_status: status, error_message: message, processed_at: new Date().toISOString() })
          .eq("id", evidenceId);
        return new Response(JSON.stringify({ ok: false, evidence_id: evidenceId, reason: message }), { headers: cors(req) });
      };

      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) return await fail("Reading service not configured", "failed");

      const { data: file, error: dlError } = await admin.storage.from("guest-documents").download(storagePath);
      if (dlError || !file) return await fail("Could not open the upload", "failed");

      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const dataUrl = `data:${mime};base64,${btoa(binary)}`;

      const prompt = [
        "Read this travel booking image or document and return ONLY JSON.",
        "Shape: {\"legs\":[{\"leg_type\":\"flight|ferry|bus|road\",\"flight_number\":\"TG6285\",",
        "\"from_code\":\"IAD\",\"to_code\":\"TPE\",\"from_name\":\"\",\"to_name\":\"\",",
        "\"scheduled_departure\":\"2026-01-02T18:40:00Z\",\"scheduled_arrival\":\"2026-01-03T05:20:00Z\",\"carrier\":\"\"}],",
        "\"booking_reference\":\"\",\"passenger_name\":\"\",\"confidence\":\"high|medium|low\"}",
        "Rules: use ISO 8601 with the correct offset; never invent a number, time, airport or carrier;",
        "omit anything you cannot read; keep legs in travel order; a ferry or shared van is a leg too.",
      ].join(" ");

      let payload: any = null;
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: "You transcribe travel documents exactly. You never guess." },
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });
        if (aiResponse.status === 429) return await fail("Reading service is busy — try again shortly", "failed");
        if (!aiResponse.ok) return await fail(`Reading service error ${aiResponse.status}`, "failed");
        const json = await aiResponse.json();
        const text = String(json?.choices?.[0]?.message?.content ?? "");
        const match = text.match(/\{[\s\S]*\}/);
        payload = match ? JSON.parse(match[0]) : null;
      } catch (aiError) {
        console.error("journey-intake extraction failed", aiError);
        return await fail("Could not read this upload", "failed");
      }

      const rows: Array<Record<string, unknown>> = Array.isArray(payload?.legs) ? payload.legs : [];
      const drafts = rows
        .map((row) => {
          const marketed = flightNo((row.flight_number ?? row.marketed_flight_number) as string);
          const from = code((row.from_code ?? row.from) as string);
          const to = code((row.to_code ?? row.to) as string);
          if (!marketed && !(from && to)) return null;
          const known = marketed ? KNOWN_CODESHARES[marketed] : undefined;
          const dep = iso(row.scheduled_departure ?? row.departure);
          return {
            leg_type: legType(row.leg_type),
            marketed_flight_number: marketed,
            operating_flight_number: known?.operating ?? null,
            operating_carrier: known?.carrier ?? ((row.carrier as string) ?? null),
            marketed_carrier: (row.carrier as string) ?? null,
            from_code: from,
            to_code: to,
            from_name: (row.from_name as string) ?? null,
            to_name: (row.to_name as string) ?? null,
            scheduled_departure: dep,
            scheduled_arrival: iso(row.scheduled_arrival ?? row.arrival),
            confidence: marketed && dep ? "high" : "medium",
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      const maskedRef = maskReference(payload?.booking_reference as string);

      if (!drafts.length) {
        await admin
          .from("journey_evidence")
          .update({
            extraction_status: "no_data",
            extracted_payload: { legs: [], note: "nothing readable" },
            booking_reference_masked: maskedRef,
            processed_at: new Date().toISOString(),
          })
          .eq("id", evidenceId);
        return new Response(
          JSON.stringify({ ok: true, evidence_id: evidenceId, legs_created: 0, enriched: [], conflicts: 0, readable: false }),
          { headers: cors(req) },
        );
      }

      const { data: existingLegs } = await admin.from("journey_legs").select("*").eq("booking_id", bookingId);
      const existing = (existingLegs ?? []) as any[];

      const appliedFields: string[] = [];
      const conflicts: Array<Record<string, unknown>> = [];
      let legsCreated = 0;

      const matchExisting = (draft: Record<string, unknown>) => {
        const marketed = draft.marketed_flight_number as string | null;
        if (marketed) {
          const hit = existing.find(
            (l) => flightNo(l.marketed_flight_number) === marketed || flightNo(l.operating_flight_number) === marketed,
          );
          if (hit) return hit;
        }
        return existing.find((l) => code(l.from_code) === draft.from_code && code(l.to_code) === draft.to_code) ?? null;
      };

      let nextOrder = existing.reduce((max, l) => Math.max(max, Number(l.leg_order) || 0), 0);

      for (const draft of drafts) {
        const hit = matchExisting(draft);
        if (!hit) {
          nextOrder += 1;
          const { error } = await admin.from("journey_legs").insert({
            booking_id: bookingId,
            leg_order: nextOrder,
            ...draft,
            source: "evidence_extracted",
            recorded_by: user.id,
            is_final_leg: false,
            notes: "Read from an uploaded booking",
          });
          if (error) throw error;
          legsCreated += 1;
          continue;
        }

        const merged = mergeLeg(hit, draft, "evidence_extracted");
        if (Object.keys(merged.updates).length) {
          // Blanks only. The leg's own source is preserved when a human set it —
          // a machine filling gaps does not promote itself over that person.
          const nextSource = (SOURCE_RANK[String(hit.source)] ?? 0) > SOURCE_RANK.evidence_extracted ? hit.source : "evidence_extracted";
          const { error } = await admin
            .from("journey_legs")
            .update({ ...merged.updates, source: nextSource, updated_at: new Date().toISOString() })
            .eq("id", hit.id);
          if (error) throw error;
          appliedFields.push(...Object.keys(merged.updates).map((f) => `${hit.id}:${f}`));
        }
        conflicts.push(...merged.conflicts);
      }

      await stampFinalLeg(admin, bookingId);
      const recorded = await recordConflicts(admin, conflicts);

      await admin
        .from("journey_evidence")
        .update({
          extraction_status: "extracted",
          extracted_payload: { legs: drafts, confidence: payload?.confidence ?? null },
          booking_reference_masked: maskedRef,
          applied_fields: appliedFields,
          conflicts_created: recorded,
          legs_created: legsCreated,
          processed_at: new Date().toISOString(),
        })
        .eq("id", evidenceId);

      return new Response(
        JSON.stringify({
          ok: true,
          evidence_id: evidenceId,
          readable: true,
          legs_created: legsCreated,
          enriched: appliedFields.length,
          conflicts: recorded,
          needs_onward: await needsOnward(admin, bookingId),
        }),
        { headers: cors(req) },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors(req) });
  } catch (error) {
    console.error("journey-intake failed", error);
    return new Response(JSON.stringify({ error: (error as Error).message ?? "Unexpected error" }), {
      status: 500,
      headers: cors(req),
    });
  }
});

/** Exactly one final leg, chosen by where the journey actually ends. */
async function stampFinalLeg(admin: any, bookingId: string) {
  const { data: legs } = await admin.from("journey_legs").select("id, leg_order, to_code").eq("booking_id", bookingId);
  if (!legs?.length) return;
  const finalOrder = pickFinalOrder(legs as any[]);
  for (const leg of legs as any[]) {
    const shouldBeFinal = leg.leg_order === finalOrder;
    await admin.from("journey_legs").update({ is_final_leg: shouldBeFinal }).eq("id", leg.id);
  }
}

/** Skip duplicates: an unresolved question is asked once, not on every save. */
async function recordConflicts(admin: any, conflicts: Array<Record<string, unknown>>): Promise<number> {
  let recorded = 0;
  for (const conflict of conflicts) {
    const { data: already } = await admin
      .from("arrival_conflicts")
      .select("id")
      .eq("booking_id", conflict.booking_id as string)
      .eq("field_name", conflict.field_name as string)
      .eq("status", "open")
      .maybeSingle();
    if (already) continue;
    const { error } = await admin.from("arrival_conflicts").insert(conflict);
    if (!error) recorded += 1;
  }
  return recorded;
}

/** Does the journey still stop short of the island? */
async function needsOnward(admin: any, bookingId: string): Promise<boolean> {
  const { data: legs } = await admin
    .from("journey_legs")
    .select("leg_order, to_code")
    .eq("booking_id", bookingId)
    .order("leg_order", { ascending: true });
  if (!legs?.length) return false;
  const last = legs[legs.length - 1];
  return !isSamui(last.to_code);
}
