import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import th from "@/i18n/locales/th.json";
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
