import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isToday,
  isBefore,
  startOfDay,
  parseISO,
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function isDateBlocked(date: Date, ranges: BlockedRange[]): boolean {
  const d = format(date, "yyyy-MM-dd");
  return ranges.some((r) => d >= r.start && d < r.end);
}

export default function EmbedWidget() {
  const { type, unitId } = useParams<{ type: string; unitId: string }>();
  const [searchParams] = useSearchParams();
  const accentColor = searchParams.get("accent") || "#9a5a30";
  const contactUrl = searchParams.get("contact_url") || "";

  const [unit, setUnit] = useState<UnitData | null>(null);
  const [units, setUnits] = useState<UnitData[]>([]);
  const [blocked, setBlocked] = useState<BlockedRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = unitId ? `?unit_id=${unitId}` : "";
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-availability${params}`, {
          headers: { apikey: SUPABASE_KEY },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");

        if (unitId) {
          setUnit(json.unit);
          setBlocked(json.blockedRanges ?? []);
        } else {
          setUnits(json.units ?? []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [unitId]);

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.muted}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={{ ...styles.muted, color: "#dc2626" }}>{error}</p>
      </div>
    );
  }

  switch (type) {
    case "listing":
      return unit ? <FullListing unit={unit} blocked={blocked} accent={accentColor} contactUrl={contactUrl} /> : <p style={styles.muted}>Unit not found</p>;
    case "compact":
      return unit ? <CompactCard unit={unit} accent={accentColor} contactUrl={contactUrl} /> : <p style={styles.muted}>Unit not found</p>;
    case "calendar":
      return unit ? <CalendarOnly unit={unit} blocked={blocked} accent={accentColor} contactUrl={contactUrl} /> : <p style={styles.muted}>Unit not found</p>;
    case "cta":
      return unit ? <CTAOnly unit={unit} accent={accentColor} contactUrl={contactUrl} /> : <p style={styles.muted}>Unit not found</p>;
    default:
      return <p style={styles.muted}>Unknown widget type</p>;
  }
}

// ── Full Listing ──
function FullListing({ unit, blocked, accent, contactUrl }: { unit: UnitData; blocked: BlockedRange[]; accent: string; contactUrl: string }) {
  return (
    <div style={{ ...styles.container, maxWidth: 480 }}>
      {unit.photos && unit.photos.length > 0 && (
        <div style={{ margin: "-20px -20px 16px", borderRadius: "12px 12px 0 0", overflow: "hidden" }}>
          <img src={unit.photos[0]} alt={unit.name} style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ ...styles.title, color: accent }}>{unit.name}</h2>
        {unit.description && <p style={styles.description}>{unit.description}</p>}
      </div>

      <div style={styles.metaRow}>
        <span style={styles.metaBadge}>Up to {unit.capacity} guests</span>
        <span style={styles.metaBadge}>Min {unit.min_nights} night{unit.min_nights > 1 ? "s" : ""}</span>
      </div>

      {(unit.amenities?.length ?? 0) > 0 && (
        <div style={{ ...styles.metaRow, marginTop: 8 }}>
          {unit.amenities!.map((a, i) => (
            <span key={i} style={{ ...styles.metaBadge, background: "#f3f4f6", border: "none" }}>{a}</span>
          ))}
        </div>
      )}

      <div style={{ margin: "16px 0", borderTop: "1px solid #e5e7eb" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 24, fontWeight: 700, color: "#1f2937" }}>฿{unit.base_price}</span>
          <span style={styles.muted}>/night</span>
        </div>
        {Number(unit.cleaning_fee ?? 0) > 0 && (
          <span style={{ ...styles.muted, fontSize: 12 }}>+ ฿{unit.cleaning_fee} cleaning</span>
        )}
      </div>

      <MiniCalendar blocked={blocked} accent={accent} />

      {contactUrl && (
        <div style={{ marginTop: 16, textAlign: "center" as const }}>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 20px", background: accent, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-block", textDecoration: "none" }}>
            {contactUrl.includes("/auth/guest") ? "Book Now" : "Check Availability"}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Compact Card ──
function CompactCard({ unit, accent, contactUrl }: { unit: UnitData; accent: string; contactUrl: string }) {
  return (
    <div style={{ ...styles.container, maxWidth: 320, padding: 0, overflow: "hidden" }}>
      {unit.photos && unit.photos.length > 0 && (
        <img src={unit.photos[0]} alt={unit.name} style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
      )}
      <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1f2937", margin: "0 0 4px" }}>{unit.name}</h3>
      {unit.description && (
        <p style={{ ...styles.muted, fontSize: 13, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
          {unit.description}
        </p>
      )}
      <div style={styles.metaRow}>
        <span style={styles.metaBadge}>{unit.capacity} guests</span>
        <span style={styles.metaBadge}>{unit.min_nights}+ nights</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#1f2937" }}>
          From ฿{unit.base_price}<span style={{ ...styles.muted, fontSize: 12 }}>/night</span>
        </span>
      </div>
      {contactUrl && (
        <div style={{ marginTop: 12, textAlign: "center" as const }}>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", background: accent, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-block", textDecoration: "none", width: "100%" }}>
            {contactUrl.includes("/auth/guest") ? "Book Now" : "Check Availability"}
          </a>
        </div>
      )}
      </div>
    </div>
  );
}

// ── Calendar Only ──
function CalendarOnly({ unit, blocked, accent, contactUrl }: { unit: UnitData; blocked: BlockedRange[]; accent: string; contactUrl: string }) {
  return (
    <div style={{ ...styles.container, maxWidth: 340 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", margin: "0 0 12px" }}>
        {unit.name} — Availability
      </h3>
      <MiniCalendar blocked={blocked} accent={accent} />
      <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#dcfce7", border: "1px solid #bbf7d0" }} />
          Available
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#fee2e2", border: "1px solid #fecaca" }} />
          Unavailable
        </span>
      </div>
      {contactUrl && (
        <div style={{ marginTop: 12, textAlign: "center" as const }}>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", background: accent, color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-block", textDecoration: "none" }}>
            {contactUrl.includes("/auth/guest") ? "Book Now" : "Check Availability"}
          </a>
        </div>
      )}
    </div>
  );
}

// ── CTA Only ──
function CTAOnly({ unit, accent, contactUrl }: { unit: UnitData; accent: string; contactUrl: string }) {
  // If contactUrl starts with the same origin or is a relative /auth path, it's a guest portal registration link
  const ctaLabel = contactUrl.includes("/auth/guest") ? "Book Now" : "Check Availability";

  return (
    <div style={{ ...styles.container, maxWidth: 280, padding: 16, textAlign: "center" as const }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1f2937", margin: "0 0 4px" }}>{unit.name}</h3>
      <p style={{ ...styles.muted, fontSize: 13, marginBottom: 12 }}>
        From <strong style={{ color: "#1f2937" }}>฿{unit.base_price}/night</strong>
      </p>
      {contactUrl ? (
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "10px 20px",
            background: accent,
            color: "#fff",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            display: "inline-block",
            textDecoration: "none",
          }}
        >
          {ctaLabel}
        </a>
      ) : (
        <div
          style={{
            padding: "10px 20px",
            background: accent,
            color: "#fff",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: "default",
            display: "inline-block",
            opacity: 0.7,
          }}
        >
          Check Availability
        </div>
      )}
    </div>
  );
}

// ── Mini Calendar Component ──
function MiniCalendar({ blocked, accent }: { blocked: BlockedRange[]; accent: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  const startDow = getDay(days[0]);
  const today = startOfDay(new Date());

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setMonth(subMonths(month, 1))} style={styles.calNav}>←</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{format(month, "MMMM yyyy")}</span>
        <button onClick={() => setMonth(addMonths(month, 1))} style={styles.calNav}>→</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, fontSize: 11, textAlign: "center" as const }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ padding: 4, color: "#9ca3af", fontWeight: 600 }}>{d}</div>
        ))}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {days.map((day) => {
          const past = isBefore(day, today) && !isToday(day);
          const blockedDay = isDateBlocked(day, blocked);
          const todayDay = isToday(day);

          let bg = "#dcfce7";
          let border = "1px solid #bbf7d0";
          let color = "#166534";

          if (past) {
            bg = "#f9fafb";
            border = "1px solid #f3f4f6";
            color = "#d1d5db";
          } else if (blockedDay) {
            bg = "#fee2e2";
            border = "1px solid #fecaca";
            color = "#991b1b";
          }

          return (
            <div
              key={day.toISOString()}
              style={{
                padding: 4,
                borderRadius: 4,
                background: bg,
                border,
                color,
                fontWeight: todayDay ? 700 : 400,
                position: "relative" as const,
              }}
            >
              {format(day, "d")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline styles (no Tailwind in embeds for portability) ──
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    padding: 20,
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 4px",
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    margin: "0",
    lineHeight: 1.5,
  },
  muted: {
    color: "#6b7280",
    fontSize: 14,
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  metaBadge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    color: "#374151",
    background: "#fff",
  },
  calNav: {
    background: "none",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 14,
    color: "#374151",
  },
};
