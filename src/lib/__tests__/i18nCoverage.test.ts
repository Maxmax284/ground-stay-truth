import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import th from "@/i18n/locales/th.json";
import fr from "@/i18n/locales/fr.json";
import de from "@/i18n/locales/de.json";
import { GUEST_READY_LANGUAGES, isGuestSurfaceKey } from "@/i18n/guestSurface";
import { humanizeKey } from "@/i18n/missingKeys";
import { translateLabel } from "@/lib/displayLabels";

type Dict = Record<string, unknown>;

function flatten(obj: Dict, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Dict, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

const flatEn = flatten(en as Dict);
const flatTh = flatten(th as Dict);

/** Stand-in for i18next's `t`, resolving against a flattened locale. */
function makeT(dict: Record<string, string>) {
  return (key: string, options?: Record<string, unknown>) =>
    dict[key] ?? (options?.defaultValue as string) ?? key;
}

describe("i18n locale integrity", () => {
  it("has a Thai string for every English key", () => {
    const missing = Object.keys(flatEn).filter((k) => !(k in flatTh));
    expect(missing).toEqual([]);
  });

  it("has no empty Thai values", () => {
    const empty = Object.entries(flatTh)
      .filter(([, v]) => !v.trim())
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("keeps interpolation variables identical between English and Thai", () => {
    const vars = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((v) => v.replace(/\s/g, "")).sort();
    const mismatched = Object.keys(flatEn).filter(
      (k) => k in flatTh && vars(flatEn[k]).join() !== vars(flatTh[k]).join(),
    );
    expect(mismatched).toEqual([]);
  });
});

describe("missing-key safety net", () => {
  it("humanizes a key instead of leaking the raw path", () => {
    expect(humanizeKey("payments.payOnArrival")).toBe("Pay on arrival");
    expect(humanizeKey("labels.bookingState.pending_deposit")).toBe("Pending deposit");
  });
});

describe("display labels", () => {
  const tEn = makeT(flatEn);
  const tTh = makeT(flatTh);

  it("translates booking, payment, pickup, cleaning and document codes", () => {
    expect(translateLabel(tEn, "bookingState", "pending_deposit")).toBe("Pending Deposit");
    expect(translateLabel(tTh, "bookingState", "pending_deposit")).toBe("รอมัดจำ");
    expect(translateLabel(tTh, "paymentStatus", "recorded")).toBe("ชำระแล้ว");
    expect(translateLabel(tTh, "pickupResolution", "pickup_scheduled")).toBe("จัดรถรับแล้ว");
    expect(translateLabel(tTh, "cleaningStatus", "dirty")).toBe("ต้องทำความสะอาด");
    expect(translateLabel(tTh, "documentType", "tm30")).toBe("TM30");
    expect(translateLabel(tTh, "marker", "pay_on_arrival")).toBe("จ่ายตอนมาถึง");
  });

  it("falls back to a humanized code, never a raw key", () => {
    const label = translateLabel(makeT({}), "bookingState", "some_new_state");
    expect(label).toBe("Some new state");
    expect(label).not.toContain("labels.");
  });

  it("handles empty codes without rendering undefined", () => {
    expect(translateLabel(tEn, "paymentStatus", null)).toBe("—");
  });
});

/**
 * Gate for shipping a language to guests. A language listed in
 * GUEST_READY_LANGUAGES must cover every guest-visible key — staff-only screens
 * may stay English, but a guest must never hit a half-translated page.
 */
describe("guest-ready languages", () => {
  const dicts: Record<string, Record<string, string>> = {
    en: flatEn,
    th: flatTh,
    fr: flatten(fr as Dict),
    de: flatten(de as Dict),
  };

  const guestKeys = Object.keys(flatEn).filter(isGuestSurfaceKey);

  it("covers a meaningful part of the dictionary", () => {
    expect(guestKeys.length).toBeGreaterThan(200);
  });

  for (const code of GUEST_READY_LANGUAGES) {
    it(`${code} translates every guest-visible key`, () => {
      const dict = dicts[code];
      expect(dict, `no dictionary loaded for ${code}`).toBeTruthy();
      const missing = guestKeys.filter((k) => !dict[k] || !dict[k].trim());
      expect(missing).toEqual([]);
    });

    it(`${code} keeps guest-visible placeholders intact`, () => {
      const dict = dicts[code];
      const vars = (s: string) =>
        (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((v) => v.replace(/\s/g, "")).sort();
      const broken = guestKeys.filter(
        (k) => dict[k] && vars(dict[k]).join() !== vars(flatEn[k]).join(),
      );
      expect(broken).toEqual([]);
    });
  }
});
