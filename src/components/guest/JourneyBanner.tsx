import { useTranslation } from "react-i18next";
import { ContextImage } from "@/components/guest/ContextImage";
import { WelcomeMoment } from "@/components/guest/WelcomeMoment";
import { STAGE_THEMES, type JourneyStage } from "@/lib/guestJourneyStage";

import preparing from "@/assets/journey-preparing.jpg";
import transit from "@/assets/journey-transit.jpg";
import islandApproach from "@/assets/journey-island-approach.jpg";
import pickup from "@/assets/journey-pickup.jpg";
import inHouse from "@/assets/journey-in-house.jpg";

const STAGE_IMAGE: Record<JourneyStage, string> = {
  preparing,
  transit,
  bangkok: transit,
  island_approach: islandApproach,
  pickup,
  in_house: inHouse,
};

interface Props {
  stage: JourneyStage | null;
  /** Optional personal touch — first name only, never invented. */
  guestName?: string | null;
}

/**
 * The stage strip that sits above the Now card. Pure atmosphere plus one line of
 * orientation — it never carries an action, a status claim or a promise. The
 * operational truth stays in the Now card directly beneath it.
 */
export function JourneyBanner({ stage, guestName }: Props) {
  const { t } = useTranslation();
  if (!stage) return null;

  const theme = STAGE_THEMES[stage];
  const first = guestName?.trim().split(/\s+/)[0] ?? null;
  const heading = first
    ? t("journeyStage.greeting", { defaultValue: "Welcome, {{name}}", name: first })
    : t(theme.titleKey, theme.titleFallback);

  return (
    <WelcomeMoment momentKey={`journey-${stage}`}>
      <ContextImage
        src={STAGE_IMAGE[stage]}
        alt={t(theme.titleKey, theme.titleFallback)}
        tintClass={theme.tintClass}
        aspectClass="aspect-[16/7] sm:aspect-[16/5]"
      >
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="journey-overlay-text text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
            {t(theme.titleKey, theme.titleFallback)}
          </p>
          <p className="journey-overlay-text text-lg sm:text-xl font-semibold leading-tight mt-0.5 [text-wrap:balance]">
            {heading}
          </p>
          <p className="journey-overlay-text text-xs sm:text-sm opacity-90 mt-1 max-w-prose">
            {t(theme.lineKey, theme.lineFallback)}
          </p>
        </div>
      </ContextImage>
    </WelcomeMoment>
  );
}
