import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, isBefore, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Users, Moon, Sparkles, ChevronLeft, ChevronRight, CalendarDays, ArrowRight, MapPin, Clock, Shield, ListChecks, LogIn, Building2 } from "lucide-react";
import { formatPriceSimple } from "@/lib/currency";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TestimonialSection } from "@/components/TestimonialSection";
import { AmenityList } from "@/components/AmenityBadge";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { OfflineBanner } from "@/components/OfflineBanner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  property_id: string | null;
}

interface PropertyData {
  id: string;
  name: string;
  slug: string;
  operational_mode: string;
}

interface BlockedRange { start: string; end: string; }

export default function Stay() {
  const navigate = useNavigate();
  const [units, setUnits] = useState<UnitData[]>([]);
  const [properties, setProperties] = useState<PropertyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState("฿");
  const [blockedByUnit, setBlockedByUnit] = useState<Record<string, BlockedRange[]>>({});
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);

  // Fetch camp_info for summary
  const [campSummary, setCampSummary] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-availability`, {
          headers: { apikey: SUPABASE_KEY },
        });
        const data = await resp.json();
        const fetchedUnits = data.units ?? [];
        const fetchedProperties = data.properties ?? [];
        const fetchedSymbol = data.currencySymbol ?? "฿";
        setUnits(fetchedUnits);
        setProperties(fetchedProperties);
        setCurrencySymbol(fetchedSymbol);
        // Cache for offline use
        try {
          localStorage.setItem("gs_cache_units", JSON.stringify(fetchedUnits));
          localStorage.setItem("gs_cache_currency", fetchedSymbol);
        } catch { /* quota */ }
      } catch {
        // Offline or error — load from cache
        try {
          const cached = localStorage.getItem("gs_cache_units");
          const cachedCurrency = localStorage.getItem("gs_cache_currency");
          if (cached) setUnits(JSON.parse(cached));
          if (cachedCurrency) setCurrencySymbol(cachedCurrency);
        } catch { /* silent */ }
      }
      setLoading(false);
    })();
  }, []);

  // Fetch camp info from policy_settings (public read)
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/policy_settings?key=eq.camp_info&select=value`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const data = await resp.json();
        if (data?.[0]?.value) {
          setCampSummary(data[0].value);
          try { localStorage.setItem("gs_cache_camp", JSON.stringify(data[0].value)); } catch { /* quota */ }
        }
      } catch {
        try {
          const cached = localStorage.getItem("gs_cache_camp");
          if (cached) setCampSummary(JSON.parse(cached));
        } catch { /* silent */ }
      }
    })();
  }, []);

  const handleRequestBooking = (unitId: string) => {
    navigate(`/auth/guest?unit=${unitId}`);
  };

  const toggleAvailability = async (unitId: string) => {
    if (expandedUnit === unitId) {
      setExpandedUnit(null);
      return;
    }
    setExpandedUnit(unitId);
    if (!blockedByUnit[unitId]) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-availability?unit_id=${unitId}`, {
          headers: { apikey: SUPABASE_KEY },
        });
        const data = await resp.json();
        setBlockedByUnit((prev) => ({ ...prev, [unitId]: data.blockedRanges ?? [] }));
      } catch { /* silent */ }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      {/* SEO metadata handled by index.html; content structure for crawlers */}
      
      {/* Hero */}
      <header className="relative auth-hero-bg text-primary-foreground overflow-hidden">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 text-xs"
            onClick={() => navigate("/auth")}
          >
            <LogIn className="h-3.5 w-3.5 mr-1" />
            Staff Login
          </Button>
          <LanguageSelector />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center space-y-4">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight">
            Ground Stay
          </h1>
          <p className="font-stat text-sm tracking-[0.2em] uppercase text-primary-foreground/60">
            Accommodation · Koh Samui
          </p>
          <p className="text-lg text-primary-foreground/80 max-w-xl mx-auto">
            Purpose-built accommodation for fighters, travelers, and long-term guests across our Koh Samui properties.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
              <Shield className="h-4 w-4" /> Direct booking — no commissions
            </div>
            <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
              <Building2 className="h-4 w-4" /> {properties.length || 2} properties
            </div>
            <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
              <Clock className="h-4 w-4" /> Long-stay discounts available
            </div>
          </div>
        </div>
        <div className="thai-stripe" />
      </header>

      {/* Units Grid — grouped by property */}
      <main className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {loading ? (
          <section>
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-80 w-full rounded-xl" />)}
            </div>
          </section>
        ) : units.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">No rooms available at this time.</p>
        ) : (
          <>
            {/* Group units by property */}
            {(() => {
              const PROPERTY_META: Record<string, { tagline: string; icon: typeof Home }> = {
                "lamai-muay-thai": { tagline: "Fighter's quarters — steps from the gym", icon: Home },
                "koh-shanti-guesthouse": { tagline: "Peaceful long-stay living on Koh Samui", icon: Building2 },
              };

              // Build sections: known properties first, then any unassigned units
              const grouped = new Map<string | null, UnitData[]>();
              for (const u of units) {
                const key = u.property_id;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(u);
              }

              // Order: properties in order, then null
              const orderedKeys: (string | null)[] = [
                ...properties.map((p) => p.id).filter((id) => grouped.has(id)),
                ...(grouped.has(null) ? [null] : []),
              ];

              return orderedKeys.map((propId) => {
                const sectionUnits = grouped.get(propId) ?? [];
                const prop = properties.find((p) => p.id === propId);
                const meta = prop ? PROPERTY_META[prop.slug] : undefined;

                return (
                  <section key={propId ?? "unassigned"} className="space-y-6">
                    <div className="space-y-1">
                      <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
                        {meta?.icon ? <meta.icon className="h-5 w-5 text-primary" /> : <Home className="h-5 w-5 text-primary" />}
                        {prop?.name ?? "Available Rooms"}
                      </h2>
                      {meta?.tagline && (
                        <p className="text-sm text-muted-foreground">{meta.tagline}</p>
                      )}
                      {prop?.operational_mode === "long_stay" && (
                        <Badge variant="secondary" className="text-xs">Long-Stay Friendly</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {sectionUnits.map((unit) => (
                        <UnitCard
                          key={unit.id}
                          unit={unit}
                          currencySymbol={currencySymbol}
                          expandedUnit={expandedUnit}
                          blockedByUnit={blockedByUnit}
                          onToggleAvailability={toggleAvailability}
                          onRequestBooking={handleRequestBooking}
                        />
                      ))}
                    </div>
                    {propId !== orderedKeys[orderedKeys.length - 1] && <Separator className="mt-4" />}
                  </section>
                );
              });
            })()}
          </>
        )}

        {/* Camp Info Summary */}
        {campSummary && (
          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-foreground">About the Camp</h2>
            {(() => {
              // Try to parse structured JSON
              let parsed: Record<string, string> | null = null;
              try {
                const val = typeof campSummary === "object" ? campSummary : JSON.parse(campSummary);
                if (typeof val === "object" && val !== null && !Array.isArray(val)) parsed = val;
              } catch { /* legacy text */ }

              if (parsed) {
                const sections = [
                  { key: "training_schedule", icon: <Clock className="h-4 w-4 text-primary" />, label: "Training Schedule" },
                  { key: "what_to_bring", icon: <ListChecks className="h-4 w-4 text-primary" />, label: "What to Bring" },
                  { key: "gym_rules", icon: <Shield className="h-4 w-4 text-primary" />, label: "Gym Rules" },
                  { key: "airport_directions", icon: <MapPin className="h-4 w-4 text-primary" />, label: "Airport Directions" },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sections.map((s) => {
                      const content = parsed![s.key];
                      if (!content) return null;
                      const firstLine = String(content).split("\n")[0];
                      return (
                        <Card key={s.key}>
                          <CardContent className="pt-5 space-y-1">
                            <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                              {s.icon} {s.label}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{firstLine}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );
              }

              // Legacy plain text fallback
              return (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{campSummary}</p>
                  </CardContent>
                </Card>
              );
            })()}
            <div className="text-center">
              <Button variant="link" className="p-0 h-auto text-primary" onClick={() => navigate("/auth/guest")}>
                Sign up to learn more <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </section>
        )}

        {/* Testimonials */}
        <TestimonialSection />

        {/* Footer CTA */}
        <section className="text-center py-8 space-y-4">
          <h2 className="font-serif text-2xl font-bold text-foreground">Ready to Train?</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Create a free account to request a booking, upload documents, and manage your stay.
          </p>
          <Button size="lg" onClick={() => navigate("/auth/guest")}>
            <Sparkles className="h-4 w-4 mr-2" />
            Create Your Account
          </Button>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Ground Stay · Lamai Muay Thai</p>
        <a href="/legal" className="text-primary hover:underline">Terms & Privacy</a>
      </footer>

      <PWAInstallBanner />
    </div>
  );
}

/* Mini Calendar for availability preview */
function MiniCalendar({ blockedRanges }: { blockedRanges: BlockedRange[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const startDow = getDay(start);

  const isBlocked = (date: Date) => {
    const d = format(date, "yyyy-MM-dd");
    return blockedRanges.some((r) => d >= r.start && d < r.end);
  };

  return (
    <div className="mt-2 rounded-lg border p-3 bg-muted/20 space-y-2">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium">{format(month, "MMMM yyyy")}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="font-medium">{d}</span>
        ))}
        {Array.from({ length: startDow }).map((_, i) => <span key={`e-${i}`} />)}
        {days.map((day) => {
          const past = isBefore(day, startOfDay(new Date())) && !isToday(day);
          const blocked = isBlocked(day);
          const today = isToday(day);
          return (
            <span
              key={day.toISOString()}
              className={`rounded py-0.5 text-[11px] ${
                past ? "text-muted-foreground/30" :
                blocked ? "bg-destructive/15 text-destructive line-through" :
                today ? "bg-primary/10 text-primary font-bold" :
                "text-foreground"
              }`}
            >
              {format(day, "d")}
            </span>
          );
        })}
      </div>
      <div className="flex gap-3 text-[10px] text-muted-foreground justify-center">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive/30" /> Unavailable</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/30" /> Today</span>
      </div>
    </div>
  );
}