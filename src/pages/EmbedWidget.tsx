import { useState, useEffect, useMemo, useRef } from "react";
import { getAmenityIcon } from "@/lib/amenityIcons";
import { Sparkles } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

/** Embed-safe photo carousel: arrows on desktop, swipe on mobile, dots, no external deps. */
function EmbedPhotoCarousel({
  photos,
  alt,
  height,
  dark,
}: { photos: string[]; alt: string; height: number; dark: boolean }) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  if (!photos.length) return null;
  const multi = photos.length > 1;
  const go = (n: number) => setIdx((n + photos.length) % photos.length);
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
    touchStartX.current = null;
  };
  const btn: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 32, height: 32, borderRadius: "50%", border: "none",
    background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 18, fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1, zIndex: 2,
  };
  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden", background: dark ? "#111827" : "#f3f4f6" }}
         onTouchStart={multi ? onTouchStart : undefined} onTouchEnd={multi ? onTouchEnd : undefined}>
      <img
        src={photos[idx]}
        alt={`${alt} photo ${idx + 1} of ${photos.length}`}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        loading={idx === 0 ? "eager" : "lazy"}
      />
      {multi && (
        <>
          <button type="button" aria-label="Previous photo" style={{ ...btn, left: 8 }} onClick={() => go(idx - 1)}>‹</button>
          <button type="button" aria-label="Next photo" style={{ ...btn, right: 8 }} onClick={() => go(idx + 1)}>›</button>
          <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4, zIndex: 2 }}>
            {photos.map((_, i) => (
              <button key={i} type="button" aria-label={`Go to photo ${i + 1}`} onClick={() => go(i)}
                style={{
                  width: i === idx ? 16 : 6, height: 6, borderRadius: 3, border: "none",
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.55)",
                  cursor: "pointer", padding: 0, transition: "width 200ms",
                }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
  isBefore,
  startOfDay,
} from "date-fns";

interface UnitData {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  base_price: number;
  weekend_price: number | null;
  cleaning_fee: number | null;
  min_nights: number;
  amenities: string[] | null;
  photos: string[] | null;
}

interface BlockedRange {
  start: string;
  end: string;
}

interface StyleConfig {
  accent: string;
  radius: number;
  font: string;
  dark: boolean;
  shadow: string;
  maxWidth: number;
  ctaLabel: string;
  hidden: Set<string>;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Cross-browser safe fetch with timeout + structured fallback handling.
// Avoids hanging embeds on Safari/Brave/ad-blockers and never throws on transient errors.
async function safeFetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
    });
    const json = await res.json().catch(() => ({}));
    if (json?.fallback) return { __fallback: true, message: json.message || "Temporarily unavailable" };
    if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function isDateBlocked(date: Date, ranges: BlockedRange[]): boolean {
  const d = format(date, "yyyy-MM-dd");
  return ranges.some((r) => d >= r.start && d < r.end);
}

function useStyleConfig(searchParams: URLSearchParams): StyleConfig {
  return useMemo(() => ({
    accent: searchParams.get("accent") || "#9a5a30",
    radius: Number(searchParams.get("radius")) || 12,
    font: searchParams.get("font") || "md",
    dark: searchParams.get("dark") === "1",
    shadow: searchParams.get("shadow") || "subtle",
    maxWidth: Number(searchParams.get("max_w")) || 480,
    ctaLabel: searchParams.get("cta_label") || "",
    hidden: new Set((searchParams.get("hide") || "").split(",").filter(Boolean)),
  }), [searchParams]);
}

function getFontSize(font: string): number {
  if (font === "sm") return 13;
  if (font === "lg") return 17;
  return 15;
}

function getShadow(shadow: string): string {
  switch (shadow) {
    case "none": return "none";
    case "medium": return "0 4px 12px rgba(0,0,0,0.1)";
    case "strong": return "0 8px 24px rgba(0,0,0,0.18)";
    default: return "0 1px 3px rgba(0,0,0,0.06)";
  }
}

function containerStyle(cfg: StyleConfig): React.CSSProperties {
  return {
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    fontSize: getFontSize(cfg.font),
    padding: 20,
    background: cfg.dark ? "#1f2937" : "#fff",
    color: cfg.dark ? "#f3f4f6" : "#1f2937",
    borderRadius: cfg.radius,
    border: `1px solid ${cfg.dark ? "#374151" : "#e5e7eb"}`,
    boxShadow: getShadow(cfg.shadow),
    maxWidth: cfg.maxWidth,
  };
}

function mutedColor(dark: boolean) { return dark ? "#9ca3af" : "#6b7280"; }
function borderColor(dark: boolean) { return dark ? "#374151" : "#e5e7eb"; }
function badgeBg(dark: boolean) { return dark ? "#374151" : "#fff"; }
function badgeBorder(dark: boolean) { return dark ? "#4b5563" : "#e5e7eb"; }
function amenityBg(dark: boolean) { return dark ? "#374151" : "#f3f4f6"; }

export default function EmbedWidget() {
  const { type, unitId } = useParams<{ type: string; unitId: string }>();
  const [searchParams] = useSearchParams();
  const cfg = useStyleConfig(searchParams);
  const contactUrl = searchParams.get("contact_url") || "";

  if (type === "grid") {
    return <GridOverview cfg={cfg} contactUrl={contactUrl} />;
  }

  return <SingleUnitWidget type={type} unitId={unitId} cfg={cfg} contactUrl={contactUrl} />;
}

function SingleUnitWidget({ type, unitId, cfg, contactUrl }: { type?: string; unitId?: string; cfg: StyleConfig; contactUrl: string }) {
  const [unit, setUnit] = useState<UnitData | null>(null);
  const [blocked, setBlocked] = useState<BlockedRange[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState("฿");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async (attempt = 0) => {
      try {
        const params = unitId ? `?unit_id=${unitId}` : "";
        const json = await safeFetchJson(`${SUPABASE_URL}/functions/v1/get-availability${params}`);
        if (cancelled) return;
        if (json?.__fallback) {
          setError(json.message);
        } else {
          if (json.currencySymbol) setCurrencySymbol(json.currencySymbol);
          if (unitId) {
            setUnit(json.unit);
            setBlocked(json.blockedRanges ?? []);
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        // One automatic retry for transient network errors (mobile, captive portals)
        if (attempt === 0) return setTimeout(() => fetchData(1), 1200);
        setError("Unable to load — please refresh");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [unitId]);

  if (loading) return <div style={containerStyle(cfg)}><p style={{ color: mutedColor(cfg.dark) }}>Loading…</p></div>;
  if (error) return <div style={containerStyle(cfg)}><p style={{ color: "#dc2626" }}>{error}</p></div>;
  if (!unit) return <p style={{ color: mutedColor(cfg.dark) }}>Unit not found</p>;

  const props = { unit, blocked, cfg, contactUrl, cs: currencySymbol };

  switch (type) {
    case "listing": return <FullListing {...props} />;
    case "compact": return <CompactCard {...props} />;
    case "calendar": return <CalendarOnly {...props} />;
    case "cta": return <CTAOnly {...props} />;
    default: return <p style={{ color: mutedColor(cfg.dark) }}>Unknown widget type</p>;
  }
}

// ── Grid Overview (multi-unit) ──
interface RoomType {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  capacity: number;
  min_nights: number;
  amenities: string[];
  photos: string[];
  cleaning_fee: number;
  unitCount: number;
}

function GridOverview({ cfg, contactUrl }: { cfg: StyleConfig; contactUrl: string }) {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState("฿");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async (attempt = 0) => {
      try {
        const json = await safeFetchJson(`${SUPABASE_URL}/functions/v1/get-availability?mode=groups`);
        if (cancelled) return;
        if (json?.__fallback) {
          setError(json.message);
        } else {
          setRoomTypes(json.roomTypes ?? []);
          if (json.currencySymbol) setCurrencySymbol(json.currencySymbol);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (attempt === 0) return setTimeout(() => fetchData(1), 1200);
        setError("Unable to load — please refresh");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={containerStyle(cfg)}><p style={{ color: mutedColor(cfg.dark) }}>Loading…</p></div>;
  if (error) return <div style={containerStyle(cfg)}><p style={{ color: "#dc2626" }}>{error}</p></div>;
  if (roomTypes.length === 0) return <div style={containerStyle(cfg)}><p style={{ color: mutedColor(cfg.dark) }}>No rooms available</p></div>;

  const defaultCtaLabel = contactUrl.includes("/stay") ? "View Listings" : contactUrl.includes("/auth/guest") ? "Reserve Your Camp Stay" : "Check Availability";

  return (
    <div style={{
      fontFamily: "'Source Sans 3', system-ui, sans-serif",
      fontSize: getFontSize(cfg.font),
      padding: 20,
      background: cfg.dark ? "#1f2937" : "#fff",
      color: cfg.dark ? "#f3f4f6" : "#1f2937",
    }}>
      <h2 style={{ fontSize: getFontSize(cfg.font) + 6, fontWeight: 700, margin: "0 0 16px", color: cfg.accent }}>
        Our Rooms
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {roomTypes.map((rt) => (
          <div key={rt.id} style={{
            borderRadius: cfg.radius,
            border: `1px solid ${borderColor(cfg.dark)}`,
            boxShadow: getShadow(cfg.shadow),
            overflow: "hidden",
            background: cfg.dark ? "#1f2937" : "#fff",
          }}>
            {rt.photos.length > 0 && (
              <EmbedPhotoCarousel photos={rt.photos} alt={rt.name} height={160} dark={cfg.dark} />
            )}
            <div style={{ padding: 14 }}>
              <h3 style={{ fontSize: getFontSize(cfg.font) + 1, fontWeight: 600, margin: "0 0 4px" }}>{rt.name}</h3>
              {rt.description && (
                <p style={{
                  color: mutedColor(cfg.dark),
                  fontSize: getFontSize(cfg.font) - 2,
                  marginBottom: 8,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as any,
                  overflow: "hidden",
                  margin: "0 0 8px",
                }}>
                  {rt.description}
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>
                  {rt.capacity} guest{rt.capacity > 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>
                  {rt.unitCount} available
                </span>
                {rt.min_nights > 1 && (
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>
                    Min {rt.min_nights}n
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: getFontSize(cfg.font) + 3, fontWeight: 700 }}>
                  {currencySymbol}{rt.base_price}<span style={{ color: mutedColor(cfg.dark), fontSize: 12 }}>/night</span>
                </span>
              </div>
              {contactUrl && (
                <div style={{ marginTop: 10 }}>
                  <CTAButton cfg={cfg} contactUrl={contactUrl} fallbackLabel={defaultCtaLabel} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CTAButton({ cfg, contactUrl, fallbackLabel }: { cfg: StyleConfig; contactUrl: string; fallbackLabel: string }) {
  if (cfg.hidden.has("cta")) return null;
  const label = cfg.ctaLabel || fallbackLabel;
  const style: React.CSSProperties = {
    padding: "10px 20px",
    background: cfg.accent,
    color: "#fff",
    borderRadius: Math.min(cfg.radius, 12),
    fontWeight: 600,
    fontSize: getFontSize(cfg.font) - 1,
    cursor: contactUrl ? "pointer" : "default",
    display: "inline-block",
    textDecoration: "none",
    opacity: contactUrl ? 1 : 0.7,
  };
  if (!contactUrl) return <div style={style}>{label}</div>;
  return <a href={contactUrl} target="_blank" rel="noopener noreferrer" style={style}>{label}</a>;
}

// ── Full Listing ──
function FullListing({ unit, blocked, cfg, contactUrl, cs }: { unit: UnitData; blocked: BlockedRange[]; cfg: StyleConfig; contactUrl: string; cs: string }) {
  const h = cfg.hidden;
  const defaultCtaLabel = contactUrl.includes("/stay") ? "View Listings" : contactUrl.includes("/auth/guest") ? "Reserve Your Camp Stay" : "Check Availability";
  return (
    <div style={containerStyle(cfg)}>
      {!h.has("photo") && unit.photos && unit.photos.length > 0 && (
        <div style={{ margin: "-20px -20px 16px", borderRadius: `${cfg.radius}px ${cfg.radius}px 0 0`, overflow: "hidden" }}>
          <EmbedPhotoCarousel photos={unit.photos} alt={unit.name} height={200} dark={cfg.dark} />
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: getFontSize(cfg.font) + 5, fontWeight: 700, margin: "0 0 4px", color: cfg.accent }}>{unit.name}</h2>
        {!h.has("description") && unit.description && <p style={{ fontSize: getFontSize(cfg.font) - 1, color: mutedColor(cfg.dark), margin: 0, lineHeight: 1.5 }}>{unit.description}</p>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {!h.has("capacity") && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>Up to {unit.capacity} guests</span>}
        {!h.has("min_nights") && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>Min {unit.min_nights} night{unit.min_nights > 1 ? "s" : ""}</span>}
      </div>

      {!h.has("amenities") && (unit.amenities?.length ?? 0) > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {unit.amenities!.map((a, i) => {
            const Icon = getAmenityIcon(a) ?? Sparkles;
            return (
              <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: amenityBg(cfg.dark), color: cfg.dark ? "#d1d5db" : "#374151", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon style={{ width: 12, height: 12 }} />
                {a}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ margin: "16px 0", borderTop: `1px solid ${borderColor(cfg.dark)}` }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: getFontSize(cfg.font) + 9, fontWeight: 700 }}>{cs}{unit.base_price}</span>
          <span style={{ color: mutedColor(cfg.dark), fontSize: getFontSize(cfg.font) - 1 }}>/night</span>
        </div>
        {!h.has("cleaning_fee") && Number(unit.cleaning_fee ?? 0) > 0 && (
          <span style={{ color: mutedColor(cfg.dark), fontSize: 12 }}>+ {cs}{unit.cleaning_fee} cleaning</span>
        )}
      </div>

      {!h.has("calendar") && <MiniCalendar blocked={blocked} cfg={cfg} />}

      {!h.has("cta") && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <CTAButton cfg={cfg} contactUrl={contactUrl} fallbackLabel={defaultCtaLabel} />
        </div>
      )}
    </div>
  );
}

// ── Compact Card ──
function CompactCard({ unit, cfg, contactUrl, cs }: { unit: UnitData; blocked: BlockedRange[]; cfg: StyleConfig; contactUrl: string; cs: string }) {
  const h = cfg.hidden;
  const defaultCtaLabel = contactUrl.includes("/stay") ? "View Listings" : contactUrl.includes("/auth/guest") ? "Reserve Your Camp Stay" : "Check Availability";
  return (
    <div style={{ ...containerStyle(cfg), padding: 0, overflow: "hidden", maxWidth: Math.min(cfg.maxWidth, 320) }}>
      {!h.has("photo") && unit.photos && unit.photos.length > 0 && (
        <EmbedPhotoCarousel photos={unit.photos} alt={unit.name} height={140} dark={cfg.dark} />
      )}
      <div style={{ padding: 16 }}>
        <h3 style={{ fontSize: getFontSize(cfg.font) + 1, fontWeight: 600, margin: "0 0 4px" }}>{unit.name}</h3>
        {!h.has("description") && unit.description && (
          <p style={{ color: mutedColor(cfg.dark), fontSize: getFontSize(cfg.font) - 2, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
            {unit.description}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {!h.has("capacity") && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>{unit.capacity} guests</span>}
          {!h.has("min_nights") && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: `1px solid ${badgeBorder(cfg.dark)}`, color: cfg.dark ? "#d1d5db" : "#374151", background: badgeBg(cfg.dark) }}>{unit.min_nights}+ nights</span>}
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: getFontSize(cfg.font) + 3, fontWeight: 700 }}>
            From {cs}{unit.base_price}<span style={{ color: mutedColor(cfg.dark), fontSize: 12 }}>/night</span>
          </span>
        </div>
        {!h.has("cta") && contactUrl && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <CTAButton cfg={cfg} contactUrl={contactUrl} fallbackLabel={defaultCtaLabel} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calendar Only ──
function CalendarOnly({ unit, blocked, cfg, contactUrl }: { unit: UnitData; blocked: BlockedRange[]; cfg: StyleConfig; contactUrl: string; cs: string }) {
  const defaultCtaLabel = contactUrl.includes("/stay") ? "View Listings" : contactUrl.includes("/auth/guest") ? "Reserve Your Camp Stay" : "Check Availability";
  return (
    <div style={{ ...containerStyle(cfg), maxWidth: Math.min(cfg.maxWidth, 340) }}>
      <h3 style={{ fontSize: getFontSize(cfg.font) - 1, fontWeight: 600, margin: "0 0 12px" }}>
        {unit.name} — Availability
      </h3>
      <MiniCalendar blocked={blocked} cfg={cfg} />
      <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#dcfce7", border: "1px solid #bbf7d0" }} /> Available
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#fee2e2", border: "1px solid #fecaca" }} /> Unavailable
        </span>
      </div>
      {!cfg.hidden.has("cta") && contactUrl && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <CTAButton cfg={cfg} contactUrl={contactUrl} fallbackLabel={defaultCtaLabel} />
        </div>
      )}
    </div>
  );
}

// ── CTA Only ──
function CTAOnly({ unit, cfg, contactUrl, cs }: { unit: UnitData; blocked: BlockedRange[]; cfg: StyleConfig; contactUrl: string; cs: string }) {
  const defaultCtaLabel = contactUrl.includes("/stay") ? "View Listings" : contactUrl.includes("/auth/guest") ? "Reserve Your Camp Stay" : "Check Availability";
  return (
    <div style={{ ...containerStyle(cfg), maxWidth: Math.min(cfg.maxWidth, 280), padding: 16, textAlign: "center" }}>
      <h3 style={{ fontSize: getFontSize(cfg.font) + 1, fontWeight: 600, margin: "0 0 4px" }}>{unit.name}</h3>
      <p style={{ color: mutedColor(cfg.dark), fontSize: getFontSize(cfg.font) - 2, marginBottom: 12 }}>
        From <strong style={{ color: cfg.dark ? "#f3f4f6" : "#1f2937" }}>{cs}{unit.base_price}/night</strong>
      </p>
      <CTAButton cfg={cfg} contactUrl={contactUrl} fallbackLabel={defaultCtaLabel} />
    </div>
  );
}

// ── Mini Calendar Component ──
function MiniCalendar({ blocked, cfg }: { blocked: BlockedRange[]; cfg: StyleConfig }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  const startDow = getDay(days[0]);
  const today = startOfDay(new Date());

  const navStyle: React.CSSProperties = {
    background: "none",
    border: `1px solid ${borderColor(cfg.dark)}`,
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 14,
    color: cfg.dark ? "#d1d5db" : "#374151",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setMonth(subMonths(month, 1))} style={navStyle}>←</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.dark ? "#d1d5db" : "#374151" }}>{format(month, "MMMM yyyy")}</span>
        <button onClick={() => setMonth(addMonths(month, 1))} style={navStyle}>→</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, fontSize: 11, textAlign: "center" }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ padding: 4, color: "#9ca3af", fontWeight: 600 }}>{d}</div>
        ))}
        {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
        {days.map((day) => {
          const past = isBefore(day, today) && !isToday(day);
          const blockedDay = isDateBlocked(day, blocked);
          const todayDay = isToday(day);

          let bg = "#dcfce7", border = "1px solid #bbf7d0", color = "#166534";
          if (past) { bg = cfg.dark ? "#1f2937" : "#f9fafb"; border = `1px solid ${cfg.dark ? "#374151" : "#f3f4f6"}`; color = "#d1d5db"; }
          else if (blockedDay) { bg = "#fee2e2"; border = "1px solid #fecaca"; color = "#991b1b"; }

          return (
            <div key={day.toISOString()} style={{ padding: 4, borderRadius: 4, background: bg, border, color, fontWeight: todayDay ? 700 : 400 }}>
              {format(day, "d")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
