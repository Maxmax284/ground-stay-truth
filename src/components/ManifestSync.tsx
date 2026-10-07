import { useTranslation } from "react-i18next";

/**
 * Manifest Sync — etched loading stamp shown while a board hydrates.
 * A quiet clipboard-style watermark (gold LMT corner mark) instead of a
 * spinner. Text only, no business meaning.
 */
export function ManifestSync({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`manifest-sync ${className}`} role="status" aria-live="polite">
      <span className="manifest-sync-mark" aria-hidden>LMT</span>
      <span className="manifest-sync-label">
        {t("common.syncingManifest", { defaultValue: "Syncing manifest…" })}
      </span>
    </div>
  );
}
