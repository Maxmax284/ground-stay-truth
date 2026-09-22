import { describe, it, expect } from "vitest";
// The provider module is Deno-runtime code but its normalizers are pure.
import {

  buildFlightKey,
  clean,
  mapAeroStatus,
  normalizeAeroApi,
  normalizeAviationStack,
  DAILY_PAID_READ_CEILING,
} from "../../../supabase/functions/_shared/flightProviders.ts";

describe("flight key sharing", () => {
  it("collapses codeshare numbers onto one physical flight", () => {
    const a = buildFlightKey("BR3", "TG6285", "2026-09-24", "TPE");
    const b = buildFlightKey("BR3", "NH5811", "2026-09-24", "TPE");
    expect(a).toBe(b);
  });

  it("keeps different dates apart", () => {
    expect(buildFlightKey("PG5125", null, "2026-09-24", "USM"))
      .not.toBe(buildFlightKey("PG5125", null, "2026-09-25", "USM"));
  });

  it("refuses a key with no flight number", () => {
    expect(buildFlightKey(null, null, "2026-09-24", "USM")).toBeNull();
  });

  it("normalises sloppy input", () => {
    expect(clean(" pg 5125 ")).toBe("PG5125");
    expect(clean("")).toBeNull();
  });
});

describe("AeroAPI status mapping", () => {
  it("honours explicit cancellation over text", () => {
    expect(mapAeroStatus("En Route", true, false)).toBe("cancelled");
  });
  it("honours diversion", () => {
    expect(mapAeroStatus("En Route", false, true)).toBe("diverted");
  });
  it("reads arrival as landed", () => {
    expect(mapAeroStatus("Arrived / Gate Arrival")).toBe("landed");
  });
  it("reads en route as in air", () => {
    expect(mapAeroStatus("En Route / On Time")).toBe("in_air");
  });
  it("never guesses when silent", () => {
    expect(mapAeroStatus(null)).toBe("unknown");
    expect(mapAeroStatus("")).toBe("unknown");
  });
});

describe("AeroAPI normalisation", () => {
  const raw = {
    ident: "BR3",
    ident_iata: "BR3",
    operator_iata: "BR",
    flight_number: "3",
    operator_name: "EVA Air",
    status: "En Route / On Time",
    cancelled: false,
    diverted: false,
    origin: { code_iata: "IAD", name: "Washington Dulles", timezone: "America/New_York" },
    destination: { code_iata: "TPE", name: "Taoyuan", timezone: "Asia/Taipei", terminal: "2", gate: "C5" },
    scheduled_out: "2026-09-24T01:00:00Z",
    scheduled_in: "2026-09-25T06:00:00Z",
    estimated_in: "2026-09-25T06:25:00Z",
    arrival_delay: 1500,
  };

  it("carries the operating carrier and route", () => {
    const f = normalizeAeroApi(raw as any, "TG6285")!;
    expect(f.provider).toBe("aeroapi");
    expect(f.operating_flight_number).toBe("BR3");
    expect(f.operating_carrier).toBe("EVA Air");
    expect(f.arrival_iata).toBe("TPE");
    expect(f.flight_status).toBe("in_air");
  });

  it("converts delay seconds to minutes", () => {
    expect(normalizeAeroApi(raw as any, "BR3")!.delay_minutes).toBe(25);
  });

  it("derives delay from estimate when none is reported", () => {
    const f = normalizeAeroApi({ ...raw, arrival_delay: 0 } as any, "BR3")!;
    expect(f.delay_minutes).toBe(25);
  });

  it("survives a date rollover without losing the arrival day", () => {
    const f = normalizeAeroApi(raw as any, "BR3")!;
    expect(f.scheduled_departure!.slice(0, 10)).toBe("2026-09-24");
    expect(f.scheduled_arrival!.slice(0, 10)).toBe("2026-09-25");
  });
});

describe("AviationStack fallback normalisation", () => {
  const row = {
    flight_date: "2026-09-25",
    flight_status: "active",
    airline: { name: "Thai Airways" },
    flight: { iata: "TG6285", codeshared: { flight_iata: "BR3", airline_name: "EVA Air" } },
    departure: { iata: "IAD", airport: "Dulles", scheduled: "2026-09-24T01:00:00+00:00" },
    arrival: { iata: "TPE", airport: "Taoyuan", scheduled: "2026-09-25T06:00:00+00:00", delay: 25, terminal: "2" },
  };

  it("separates the marketed number from the operating one", () => {
    const f = normalizeAviationStack(row as any, "TG6285")!;
    expect(f.provider).toBe("aviationstack");
    expect(f.marketed_flight_number).toBe("TG6285");
    expect(f.operating_flight_number).toBe("BR3");
    expect(f.operating_carrier).toBe("EVA Air");
    expect(f.flight_status).toBe("in_air");
  });

  it("produces the same shared key as the primary provider", () => {
    const aero = normalizeAeroApi(
      { ident_iata: "BR3", operator_iata: "BR", flight_number: "3", destination: { code_iata: "TPE" }, origin: {} } as any,
      "BR3",
    )!;
    const stack = normalizeAviationStack(row as any, "TG6285")!;
    expect(buildFlightKey(stack.operating_flight_number, stack.marketed_flight_number, "2026-09-25", stack.arrival_iata))
      .toBe(buildFlightKey(aero.operating_flight_number, aero.marketed_flight_number, "2026-09-25", aero.arrival_iata));
  });

  it("never invents a status it was not given", () => {
    const f = normalizeAviationStack({ ...row, flight_status: undefined } as any, "TG6285")!;
    expect(f.flight_status).toBe("unknown");
  });
});

describe("paid read ceiling", () => {
  it("is a measured, conservative number for CampStay volumes", () => {
    // ~8 flights per 30 days measured; 25/day leaves large headroom and caps spend.
    expect(DAILY_PAID_READ_CEILING).toBe(25);
  });
});
