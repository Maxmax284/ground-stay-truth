// Shared types + defaults for the Accommodation Showcase block on /stay.
// Stored as JSON in policy_settings.key = 'stay_showcase'.

export type ShowcaseLayout = "hero_fade" | "card_carousel" | "gallery_strip";
export type ShowcaseSpeed = "slow" | "normal" | "fast";
export type ShowcaseTransition = "fade" | "slide";
export type ShowcaseImageFit = "cover" | "contain";

export interface ShowcaseSlide {
  id: string;
  image_url: string;
  caption?: string;
  alt?: string;
  link_unit_id?: string | null;
  link_url?: string | null;
  active: boolean;
  order: number;
}

export interface StayShowcaseConfig {
  enabled: boolean;
  layout: ShowcaseLayout;
  autoplay: boolean;
  speed: ShowcaseSpeed;
  transition: ShowcaseTransition;
  image_fit: ShowcaseImageFit;
  show_captions: boolean;
  show_indicators: boolean;
  slides: ShowcaseSlide[];
}

export const DEFAULT_SHOWCASE: StayShowcaseConfig = {
  enabled: false,
  layout: "hero_fade",
  autoplay: true,
  speed: "normal",
  transition: "fade",
  image_fit: "cover",
  show_captions: true,
  show_indicators: true,
  slides: [],
};

export const SPEED_MS: Record<ShowcaseSpeed, number> = {
  slow: 7000,
  normal: 4500,
  fast: 2500,
};

export function normalizeShowcase(raw: unknown): StayShowcaseConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SHOWCASE };
  const r = raw as Partial<StayShowcaseConfig>;
  return {
    enabled: r.enabled ?? DEFAULT_SHOWCASE.enabled,
    layout: (["hero_fade", "card_carousel", "gallery_strip"].includes(r.layout as string)
      ? r.layout
      : DEFAULT_SHOWCASE.layout) as ShowcaseLayout,
    autoplay: r.autoplay ?? DEFAULT_SHOWCASE.autoplay,
    speed: (["slow", "normal", "fast"].includes(r.speed as string)
      ? r.speed
      : DEFAULT_SHOWCASE.speed) as ShowcaseSpeed,
    transition: (["fade", "slide"].includes(r.transition as string)
      ? r.transition
      : DEFAULT_SHOWCASE.transition) as ShowcaseTransition,
    image_fit: (["cover", "contain"].includes(r.image_fit as string)
      ? r.image_fit
      : DEFAULT_SHOWCASE.image_fit) as ShowcaseImageFit,
    show_captions: r.show_captions ?? DEFAULT_SHOWCASE.show_captions,
    show_indicators: r.show_indicators ?? DEFAULT_SHOWCASE.show_indicators,
    slides: Array.isArray(r.slides)
      ? r.slides
          .filter((s) => s && typeof (s as ShowcaseSlide).image_url === "string")
          .map((s, i) => ({
            id: (s as ShowcaseSlide).id || `slide-${i}`,
            image_url: (s as ShowcaseSlide).image_url,
            caption: (s as ShowcaseSlide).caption ?? "",
            alt: (s as ShowcaseSlide).alt ?? "",
            link_unit_id: (s as ShowcaseSlide).link_unit_id ?? null,
            link_url: (s as ShowcaseSlide).link_url ?? null,
            active: (s as ShowcaseSlide).active ?? true,
            order: (s as ShowcaseSlide).order ?? i,
          }))
      : [],
  };
}
