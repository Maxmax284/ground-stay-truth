import { describe, it, expect } from "vitest";
import { normalizeIntlPhone, toWaLink, toTelLink } from "../contactLinks";

describe("contactLinks", () => {
  it("normalizes international numbers", () => {
    expect(normalizeIntlPhone("+66 81-234 5678")).toBe("+66812345678");
    expect(normalizeIntlPhone("0066812345678")).toBe("+66812345678");
  });
  it("rejects local or junk numbers", () => {
    expect(normalizeIntlPhone("0812345678")).toBeNull();
    expect(normalizeIntlPhone("abc")).toBeNull();
    expect(normalizeIntlPhone("")).toBeNull();
  });
  it("builds links", () => {
    expect(toWaLink("+66 81 234 5678")).toBe("https://wa.me/66812345678");
    expect(toTelLink("+66812345678")).toBe("tel:+66812345678");
    expect(toWaLink(null)).toBeNull();
  });
});
