import { useEffect, useMemo, useState, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import {
  type StayShowcaseConfig,
  type ShowcaseSlide,
  DEFAULT_SHOWCASE,
  SPEED_MS,
  normalizeShowcase,
} from "@/lib/stayShowcase";
import { useAuth } from "@/hooks/useAuth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Props {
  /** Optional config override (used by the admin live preview). When omitted, fetches from policy_settings. */
  configOverride?: StayShowcaseConfig;
  /** When previewing, never hide on enabled=false. */
  forceShow?: boolean;
}

export default function AccommodationShowcase({ configOverride, forceShow }: Props) {
  const [fetched, setFetched] = useState<StayShowcaseConfig | null>(null);
  const [rowMissing, setRowMissing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { role } = useAuth();
  const isStaff = !!role && role !== "guest";

  useEffect(() => {
    if (configOverride) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/policy_settings?key=eq.stay_showcase&select=value`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
        );
        const data = await resp.json();
        if (cancelled) return;
        if (!Array.isArray(data) || data.length === 0) {
          setRowMissing(true);
          setFetched({ ...DEFAULT_SHOWCASE });
        } else {
          setFetched(normalizeShowcase(data[0]?.value ?? null));
        }
      } catch (e: any) {
        if (!cancelled) {
          setFetchError(e?.message ?? "Failed to load showcase");
          setFetched({ ...DEFAULT_SHOWCASE });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configOverride]);

  const config = configOverride ?? fetched;

  const activeSlides = useMemo(
    () =>
      config
        ? [...config.slides].filter((s) => s.active).sort((a, b) => a.order - b.order)
        : [],
    [config],
  );

  if (!config) return null;

  const disabled = !config.enabled;
  const empty = activeSlides.length === 0;

  if (!forceShow && (disabled || empty || rowMissing || fetchError)) {
    if (!isStaff) return null;
    return (
      <section className="max-w-5xl mx-auto px-4 mt-6 mb-4">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-medium text-foreground">Stay Showcase is hidden from guests</p>
            <p className="text-muted-foreground mt-0.5">
              {fetchError
                ? `Failed to load showcase config: ${fetchError}`
                : rowMissing
                  ? "No stay_showcase row exists in policy_settings yet."
                  : disabled
                    ? "Showcase is disabled. Toggle 'Show on /stay page' on and Save."
                    : "Showcase is enabled but has no active slides. Add slides from your unit photos."}
            </p>
            <a
              href="/settings"
              className="inline-block mt-1 text-xs font-medium text-primary hover:underline"
            >
              Open Settings → Policies → Stay Showcase →
            </a>
            <p className="text-[11px] text-muted-foreground/70 mt-1">Only staff see this notice.</p>
          </div>
        </div>
      </section>
    );
  }


  const handleSlideClick = (slide: ShowcaseSlide) => {
    if (slide.link_url) {
      window.open(slide.link_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (slide.link_unit_id) {
      const el = document.getElementById(`unit-${slide.link_unit_id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 mt-6 mb-4" aria-label="Accommodation showcase">
      {config.layout === "hero_fade" && (
        <HeroFade slides={activeSlides} config={config} onSlideClick={handleSlideClick} />
      )}
      {config.layout === "card_carousel" && (
        <CardCarousel slides={activeSlides} config={config} onSlideClick={handleSlideClick} />
      )}
      {config.layout === "gallery_strip" && (
        <GalleryStrip slides={activeSlides} config={config} onSlideClick={handleSlideClick} />
      )}
    </section>
  );
}

/* ───────────── Hero Fade ───────────── */
function HeroFade({
  slides,
  config,
  onSlideClick,
}: {
  slides: ShowcaseSlide[];
  config: StayShowcaseConfig;
  onSlideClick: (s: ShowcaseSlide) => void;
}) {
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (!config.autoplay || slides.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!paused.current) setIdx((i) => (i + 1) % slides.length);
    }, SPEED_MS[config.speed]);
    return () => clearInterval(id);
  }, [config.autoplay, config.speed, slides.length]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-muted/30 aspect-[4/5] sm:aspect-[16/9]"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      {slides.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSlideClick(s)}
          aria-hidden={i !== idx}
          aria-label={s.alt || s.caption || `Showcase slide ${i + 1}`}
          className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${
            i === idx ? "opacity-100" : "opacity-0 pointer-events-none"
          } ${s.link_unit_id || s.link_url ? "cursor-pointer" : "cursor-default"}`}
          tabIndex={i === idx ? 0 : -1}
        >
          <img
            src={s.image_url}
            alt={s.alt || s.caption || ""}
            loading={i === 0 ? "eager" : "lazy"}
            className={`w-full h-full ${config.image_fit === "contain" ? "object-contain bg-black" : "object-cover"}`}
          />
          {config.show_captions && s.caption && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 sm:p-6 text-left">
              <p className="text-white text-sm sm:text-base font-medium drop-shadow">
                {s.caption}
              </p>
            </div>
          )}
        </button>
      ))}

      {config.show_indicators && slides.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === idx ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── Card Carousel ───────────── */
function CardCarousel({
  slides,
  config,
  onSlideClick,
}: {
  slides: ShowcaseSlide[];
  config: StayShowcaseConfig;
  onSlideClick: (s: ShowcaseSlide) => void;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selected, setSelected] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || !config.autoplay || slides.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!paused.current) emblaApi.scrollNext();
    }, SPEED_MS[config.speed]);
    return () => clearInterval(id);
  }, [emblaApi, config.autoplay, config.speed, slides.length]);

  return (
    <div
      className="relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="overflow-hidden rounded-xl" ref={emblaRef}>
        <div className="flex">
          {slides.map((s) => (
            <div
              key={s.id}
              className="min-w-0 shrink-0 grow-0 basis-full sm:basis-1/2 lg:basis-1/3 pr-3"
            >
              <button
                type="button"
                onClick={() => onSlideClick(s)}
                className="block w-full text-left rounded-lg overflow-hidden bg-muted/30 group"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={s.image_url}
                    alt={s.alt || s.caption || ""}
                    loading="lazy"
                    className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
                      config.image_fit === "contain" ? "object-contain bg-black" : "object-cover"
                    }`}
                  />
                </div>
                {config.show_captions && s.caption && (
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{s.caption}</p>
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            aria-label="Previous"
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 h-9 w-9 rounded-full bg-background/90 border border-border items-center justify-center shadow-sm hover:bg-background"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            aria-label="Next"
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 h-9 w-9 rounded-full bg-background/90 border border-border items-center justify-center shadow-sm hover:bg-background"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {config.show_indicators && (
            <div className="flex justify-center gap-1.5 mt-3">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === selected ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────── Gallery Strip ───────────── */
function GalleryStrip({
  slides,
  config,
  onSlideClick,
}: {
  slides: ShowcaseSlide[];
  config: StayShowcaseConfig;
  onSlideClick: (s: ShowcaseSlide) => void;
}) {
  return (
    <div
      className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-thin"
      style={{ scrollbarWidth: "thin" }}
    >
      {slides.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSlideClick(s)}
          className="snap-start shrink-0 w-[85%] sm:w-1/2 lg:w-1/3 rounded-lg overflow-hidden bg-muted/30 text-left group"
        >
          <div className="aspect-[4/3] overflow-hidden">
            <img
              src={s.image_url}
              alt={s.alt || s.caption || ""}
              loading="lazy"
              className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
                config.image_fit === "contain" ? "object-contain bg-black" : "object-cover"
              }`}
            />
          </div>
          {config.show_captions && s.caption && (
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-foreground line-clamp-1">{s.caption}</p>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
