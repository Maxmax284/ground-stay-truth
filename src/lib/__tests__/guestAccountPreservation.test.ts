import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

// Exercise the actual server function against a database mock, without sending
// emails or creating accounts in the live system.
const source = readFileSync("supabase/functions/admin-booking-flow/index.ts", "utf8");
const helpers = source.slice(source.indexOf("function asString"), source.indexOf("async function notifyRoles"));
const js = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const ensureGuestAccount = new Function(`${js}; return ensureGuestAccount;`)();

describe("booking creation preserves account identity", () => {
  it("keeps Kenny's profile while recording Rob as the booking guest", async () => {
    const profile = { user_id: "owner-id", full_name: "Kenny Gayle", email: "owner@example.test", phone: "+66812345678", preferred_language: "en" };
    const original = { ...profile };
    const admin = {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }),
        upsert: async (values: object, options: { ignoreDuplicates?: boolean }) => {
          if (table === "profiles" && !options.ignoreDuplicates) Object.assign(profile, values);
          return { error: null };
        },
      }),
    };
    const result = await ensureGuestAccount(admin, { email: profile.email, full_name: "Rob Smith", phone: "+66987654321", preferred_language: "fr" });
    expect(profile).toEqual(original);
    expect(result.fullName).toBe("Rob Smith");
    expect(result.userId).toBe("owner-id");
    expect(result.createdAccount).toBe(false);
  });
});