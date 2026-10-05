// Daily Ops Brief — one deterministic morning read shared by the morning
// briefing (email/messaging) and Corner Talk. Read-only: counts facts, never
// changes a booking, message, email or draft. Sandbox bookings are excluded.

export interface OpsBrief {
  date: string;
  arrivals: number;
  arrivalsMissingFlight: number;
  arrivalsMissingId: number;
  departures: number;
  overnightMessages: number;
  bouncedEmails: number;
  pendingDrafts: number;
  line: string;
}

export function bangkokToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export async function buildOpsBrief(admin: any, propertyIds?: string[] | null): Promise<OpsBrief> {
  const date = bangkokToday();
  // "Overnight" = since 18:00 Bangkok yesterday (11:00 UTC the previous day).
  const since = new Date(`${date}T11:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 1);
  const sinceIso = since.toISOString();
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();

  const scope = (q: any) => (propertyIds && propertyIds.length ? q.in("property_id", propertyIds) : q);

  const [arrRes, depRes, msgRes, emailRes, draftRes] = await Promise.all([
    scope(admin.from("bookings").select("id, guest_id, flight_number, property_id")
      .eq("check_in", date).in("state", ["confirmed", "pending_deposit", "pending_approval"])).limit(200),
    scope(admin.from("bookings").select("id", { count: "exact", head: true })
      .eq("check_out", date).eq("state", "checked_in")),
    scope(admin.from("messages").select("booking_id, sender_id, bookings!inner(guest_id)")
      .eq("is_internal", false).is("external_ref", null).gte("created_at", sinceIso)).limit(500),
    admin.from("email_send_log").select("recipient_email")
      .in("status", ["failed", "bounced", "error"]).gte("created_at", day).limit(500),
    scope(admin.from("ai_action_drafts").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  for (const r of [arrRes, depRes, msgRes, emailRes, draftRes]) if (r.error) throw r.error;

  // Drop sandbox bookings from arrivals.
  let arrivals = (arrRes.data ?? []) as any[];
  if (arrivals.length) {
    const { data: sb } = await admin.from("properties").select("id").eq("is_sandbox", true);
    const sandbox = new Set((sb ?? []).map((p: any) => p.id));
    arrivals = arrivals.filter((b) => !sandbox.has(b.property_id));
  }
  const ids = arrivals.map((b) => b.id);
  let missingFlight = 0, missingId = 0;
  if (ids.length) {
    const [pk, docs] = await Promise.all([
      admin.from("airport_pickups").select("booking_id").in("booking_id", ids).not("flight_number", "is", null),
      admin.from("guest_documents").select("booking_id").in("booking_id", ids).eq("superseded", false),
    ]);
    if (pk.error) throw pk.error;
    if (docs.error) throw docs.error;
    const withFlight = new Set((pk.data ?? []).map((r: any) => r.booking_id));
    const withId = new Set((docs.data ?? []).map((r: any) => r.booking_id));
    missingFlight = arrivals.filter((b) => !b.flight_number && !withFlight.has(b.id)).length;
    missingId = arrivals.filter((b) => !withId.has(b.id)).length;
  }

  const overnightMessages = (msgRes.data ?? []).filter((m: any) => m.sender_id === m.bookings?.guest_id).length;
  const bouncedEmails = new Set((emailRes.data ?? []).map((r: any) => r.recipient_email)).size;
  const pendingDrafts = draftRes.count ?? 0;
  const departures = depRes.count ?? 0;

  const parts = [arrivals.length ? `${plural(arrivals.length, "arrival")} today` : "No arrivals today"];
  if (missingFlight) parts.push(`${missingFlight} missing flight info`);
  if (missingId) parts.push(`${missingId} missing ID`);
  if (departures) parts.push(`${plural(departures, "departure")}`);
  parts.push(overnightMessages ? `${plural(overnightMessages, "guest message")} overnight` : "no guest messages overnight");
  if (bouncedEmails) parts.push(`${plural(bouncedEmails, "email")} bounced`);
  if (pendingDrafts) parts.push(`${plural(pendingDrafts, "AI draft")} waiting for review`);

  return {
    date,
    arrivals: arrivals.length,
    arrivalsMissingFlight: missingFlight,
    arrivalsMissingId: missingId,
    departures,
    overnightMessages,
    bouncedEmails,
    pendingDrafts,
    line: parts.join(". ") + ".",
  };
}
