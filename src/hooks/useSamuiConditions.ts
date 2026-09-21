import { useQuery } from "@tanstack/react-query";

/** Lamai Beach, Koh Samui */
const LAT = 9.4667;
const LON = 100.0469;

export interface TideEvent {
  time: string;
  type: "high" | "low";
  height: number;
}

export interface SamuiConditions {
  temperature: number | null;
  feelsLike: number | null;
  weatherCode: number | null;
  windKph: number | null;
  precipitation: number | null;
  daily: Array<{
    date: string;
    code: number | null;
    max: number | null;
    min: number | null;
    rainChance: number | null;
  }>;
  waveHeight: number | null;
  wavePeriod: number | null;
  tides: TideEvent[];
  updatedAt: string;
}

/** Open-Meteo WMO weather codes → plain English + emoji. */
export function describeWeather(code: number | null): { label: string; emoji: string } {
  if (code === null || code === undefined) return { label: "Unknown", emoji: "❔" };
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code <= 2) return { label: "Mostly sunny", emoji: "🌤️" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code <= 48) return { label: "Fog", emoji: "🌫️" };
  if (code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 67) return { label: "Rain", emoji: "🌧️" };
  if (code <= 77) return { label: "Squalls", emoji: "🌧️" };
  if (code <= 82) return { label: "Heavy showers", emoji: "⛈️" };
  if (code <= 86) return { label: "Showers", emoji: "🌧️" };
  return { label: "Thunderstorms", emoji: "⛈️" };
}

/** Surf read for a Gulf-of-Thailand beach break — honest, not hyped. */
export function describeSurf(waveHeight: number | null): { label: string; note: string } {
  if (waveHeight === null) return { label: "No reading", note: "Sea data is unavailable right now." };
  if (waveHeight < 0.2) return { label: "Flat / glass", note: "Swimming weather. Nothing to surf." };
  if (waveHeight < 0.5) return { label: "Ankle slappers", note: "Fine for a paddle, not a session." };
  if (waveHeight < 1) return { label: "Knee to waist", note: "Playful. Longboard or foamie day." };
  if (waveHeight < 1.6) return { label: "Chest high", note: "Rare treat for Lamai — go early." };
  return { label: "Big and messy", note: "Choppy shore break. Watch the current." };
}

function findTides(times: string[], heights: (number | null)[]): TideEvent[] {
  const out: TideEvent[] = [];
  const now = Date.now();
  for (let i = 1; i < heights.length - 1; i++) {
    const prev = heights[i - 1];
    const cur = heights[i];
    const next = heights[i + 1];
    if (prev === null || cur === null || next === null) continue;
    const isHigh = cur >= prev && cur > next;
    const isLow = cur <= prev && cur < next;
    if (!isHigh && !isLow) continue;
    if (new Date(times[i]).getTime() < now - 30 * 60 * 1000) continue;
    out.push({ time: times[i], type: isHigh ? "high" : "low", height: cur });
    if (out.length >= 4) break;
  }
  return out;
}

async function fetchConditions(): Promise<SamuiConditions> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FBangkok&forecast_days=3`;
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}` +
    `&current=wave_height,wave_period&hourly=sea_level_height_msl&timezone=Asia%2FBangkok&forecast_days=2`;

  const [forecastRes, marineRes] = await Promise.allSettled([
    fetch(forecastUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error("weather unavailable")))),
    fetch(marineUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error("marine unavailable")))),
  ]);

  if (forecastRes.status === "rejected" && marineRes.status === "rejected") {
    throw new Error("Conditions feed unavailable");
  }

  const f: any = forecastRes.status === "fulfilled" ? forecastRes.value : {};
  const m: any = marineRes.status === "fulfilled" ? marineRes.value : {};

  const daily = (f.daily?.time ?? []).map((date: string, i: number) => ({
    date,
    code: f.daily?.weather_code?.[i] ?? null,
    max: f.daily?.temperature_2m_max?.[i] ?? null,
    min: f.daily?.temperature_2m_min?.[i] ?? null,
    rainChance: f.daily?.precipitation_probability_max?.[i] ?? null,
  }));

  return {
    temperature: f.current?.temperature_2m ?? null,
    feelsLike: f.current?.apparent_temperature ?? null,
    weatherCode: f.current?.weather_code ?? null,
    windKph: f.current?.wind_speed_10m ?? null,
    precipitation: f.current?.precipitation ?? null,
    daily,
    waveHeight: m.current?.wave_height ?? null,
    wavePeriod: m.current?.wave_period ?? null,
    tides: findTides(m.hourly?.time ?? [], m.hourly?.sea_level_height_msl ?? []),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Live Lamai conditions straight from Open-Meteo (no key, no backend hop).
 * Cached for 30 minutes — this is gate-killing content, not an ops feed.
 */
export function useSamuiConditions(enabled = true) {
  return useQuery({
    queryKey: ["samui-conditions"],
    enabled,
    queryFn: fetchConditions,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
