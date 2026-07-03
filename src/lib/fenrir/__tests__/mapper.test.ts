/**
 * Fenrir mapper / helper smoke tests.
 *
 * These tests exercise the pure logic that runs inside the Deno edge helper
 * (`supabase/functions/_shared/fenrir.ts`) via its extracted node-safe
 * counterpart (`supabase/functions/_shared/fenrir-mapper.ts`), plus the
 * full `sendFenrirSecurityEvent` flow with a mocked Supabase client.
 *
 * We assert the Phase 3A doctrine:
 *   1. Internal names map to the correct dotted Fenrir event.
 *   2. Unknown event types are rejected *before* any network call.
 *   3. `actor_email` becomes `actor_email_hash` (SHA-256, never raw).
 *   4. Raw email / phone / passport / message / content fields are stripped.
 *   5. `amount` becomes `amount_bucket`.
 *   6. Fenrir outage does not throw into the caller flow.
 *   7. API key never appears in the client bundle (surface check).
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FENRIR_EVENT_MAP,
  mapEventType,
  scrubDetails,
  bucketAmount,
  sha256Hex,
} from "../../../../supabase/functions/_shared/fenrir-mapper";
import { sendFenrirSecurityEvent } from "../../../../supabase/functions/_shared/fenrir";

// ── 1. Mapper: known internal → dotted namespace ──
describe("FENRIR_EVENT_MAP", () => {
  it("maps Phase 3A payment events", () => {
    expect(mapEventType("payment_processed")).toBe("payment.processed");
    expect(mapEventType("payment_failed")).toBe("payment.failed");
    expect(mapEventType("webhook_rejected")).toBe("payment.webhook_rejected");
  });

  it("maps Phase 3A admin/staff events", () => {
    expect(mapEventType("staff_created")).toBe("admin.staff_created");
    expect(mapEventType("role_changed")).toBe("admin.role_changed");
    expect(mapEventType("privilege_escalation")).toBe(
      "admin.privilege_escalation",
    );
  });

  it("maps Phase 3A guest export / GDPR events", () => {
    expect(mapEventType("bulk_guest_export")).toBe("guest.bulk_export");
    expect(mapEventType("gdpr_request_received")).toBe("guest.gdpr_request");
  });

  it("rejects unknown internal event names", () => {
    expect(mapEventType("definitely_not_a_real_event")).toBeNull();
  });
});

// ── 2. Scrubber: PII minimization ──
describe("scrubDetails", () => {
  it("hashes actor_email into actor_email_hash", async () => {
    const out = await scrubDetails({ actor_email: "Test@Example.com" });
    expect(out.actor_email).toBeUndefined();
    expect(typeof out.actor_email_hash).toBe("string");
    // stable hash: sha256("test@example.com")
    expect(out.actor_email_hash).toBe(await sha256Hex("test@example.com"));
    expect(out.actor_email_hash).toHaveLength(64);
  });

  it("strips raw email / phone / passport / message / content fields", async () => {
    const out = await scrubDetails({
      email: "raw@example.com",
      phone: "+66-123-456",
      phone_number: "+66-123-456",
      passport: "P123456",
      passport_number: "P123456",
      id_number: "ID-999",
      message: "hi there, please refund me",
      content: "conversation body",
      guest_name: "John Doe",
      full_name: "John Doe",
      first_name: "John",
      last_name: "Doe",
      address: "1 somewhere",
      notes: "special request",
    });
    for (const key of [
      "email",
      "phone",
      "phone_number",
      "passport",
      "passport_number",
      "id_number",
      "message",
      "content",
      "guest_name",
      "full_name",
      "first_name",
      "last_name",
      "address",
      "notes",
    ]) {
      expect(out[key]).toBeUndefined();
    }
  });

  it("converts amount into amount_bucket and drops raw amount", async () => {
    const out = await scrubDetails({ amount: 4200 });
    expect(out.amount).toBeUndefined();
    expect(out.amount_bucket).toBe("1k-10k");
  });

  it("keeps benign identifiers (booking_id, target_user_id, provider)", async () => {
    const out = await scrubDetails({
      booking_id: "b-1",
      target_user_id: "u-2",
      provider: "stripe",
    });
    expect(out.booking_id).toBe("b-1");
    expect(out.target_user_id).toBe("u-2");
    expect(out.provider).toBe("stripe");
  });
});

describe("bucketAmount", () => {
  it("buckets across canonical ranges", () => {
    expect(bucketAmount(0)).toBe("0");
    expect(bucketAmount(50)).toBe("<100");
    expect(bucketAmount(500)).toBe("100-1k");
    expect(bucketAmount(4200)).toBe("1k-10k");
    expect(bucketAmount(50_000)).toBe("10k-100k");
    expect(bucketAmount(250_000)).toBe("100k+");
  });
});

// ── 3. sendFenrirSecurityEvent — full flow with mocked Supabase ──

function mockSupabase({
  enabled = false,
  endpoint = "",
}: { enabled?: boolean; endpoint?: string } = {}) {
  const inserts: any[] = [];
  const policyRows = [
    { key: "fenrir_enabled", value: enabled ? "true" : "false" },
    { key: "fenrir_endpoint", value: endpoint },
  ];
  const client = {
    _inserts: inserts,
    from(table: string) {
      if (table === "policy_settings") {
        return {
          select: () => ({
            in: async () => ({ data: policyRows, error: null }),
          }),
        };
      }
      if (table === "integration_secrets") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "security_events") {
        return {
          insert: async (row: any) => {
            inserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      return { select: () => ({}) };
    },
  };
  return client as any;
}

describe("sendFenrirSecurityEvent", () => {
  it("rejects unknown event types before any network call", async () => {
    const supabase = mockSupabase({ enabled: true, endpoint: "https://example" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await sendFenrirSecurityEvent(
      { event_type: "not_a_real_event", severity: "low" },
      { supabase },
    );
    expect(res.status).toBe("rejected");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(supabase._inserts).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("logs locally and skips network when Fenrir disabled", async () => {
    const supabase = mockSupabase({ enabled: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await sendFenrirSecurityEvent(
      {
        event_type: "payment_processed",
        severity: "low",
        details: {
          booking_id: "b-1",
          amount: 4200,
          actor_email: "ops@example.com",
        },
      },
      { supabase },
    );
    expect(res.status).toBe("logged");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(supabase._inserts).toHaveLength(1);
    const envelope = supabase._inserts[0].details;
    expect(envelope.event_type).toBe("payment.processed");
    expect(envelope.internal_event_type).toBe("payment_processed");
    expect(envelope.details.amount_bucket).toBe("1k-10k");
    expect(envelope.details.amount).toBeUndefined();
    expect(envelope.details.actor_email).toBeUndefined();
    expect(envelope.details.actor_email_hash).toHaveLength(64);
    fetchSpy.mockRestore();
  });

  it("swallows Fenrir network outage without throwing", async () => {
    const supabase = mockSupabase({
      enabled: true,
      endpoint: "https://fenrir.invalid/ingest",
    });
    // Force fetch to throw (simulate outage). Helper must not re-throw.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        throw new Error("ECONNREFUSED");
      });
    // Also inject an API key via the mocked integration_secrets table.
    supabase.from = ((orig) => (table: string) => {
      if (table === "integration_secrets") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { encrypted_value: "test-key" },
                error: null,
              }),
            }),
          }),
        };
      }
      return orig(table);
    })(supabase.from.bind(supabase));

    let threw = false;
    let res: Awaited<ReturnType<typeof sendFenrirSecurityEvent>> | null = null;
    try {
      res = await sendFenrirSecurityEvent(
        {
          event_type: "bulk_guest_export",
          severity: "high",
          details: { record_count: 3 },
        },
        { supabase },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(res?.status).toBe("logged");
    expect(res?.reason).toMatch(/network/i);
    fetchSpy.mockRestore();
  });
});

// ── 4. API key never leaks into the client bundle ──
describe("API key surface check", () => {
  it("no source file under src/ references FENRIR_API_KEY", () => {
    const hits: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
          const src = readFileSync(full, "utf8");
          if (src.includes("FENRIR_API_KEY")) hits.push(full);
        }
      }
    }
    walk("src");
    expect(hits).toEqual([]);
  });

  it("does not expose sendFenrirSecurityEvent from any src/ module", () => {
    const hits: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) {
          const src = readFileSync(full, "utf8");
          if (src.includes("sendFenrirSecurityEvent")) hits.push(full);
        }
      }
    }
    walk("src");
    expect(hits).toEqual([]);
  });
});
