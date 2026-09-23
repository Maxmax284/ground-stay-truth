import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  src: string;
  /** Required — these images carry meaning for the stage they illustrate. */
  alt: string;
  className?: string;
  /** Tailwind aspect utility, e.g. "aspect-[16/6]". */
  aspectClass?: string;
  /** Token-driven tint overlay class. */
  tintClass?: string;
  children?: React.ReactNode;
}

/**
 * Detects a connection the guest would not want us spending on: explicit
 * data-saver, or a 2g/slow-2g effective type. Offline counts too — there is no
 * point queuing a decorative fetch when the network is gone.
 */
function prefersLightData(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.onLine === false) return true;
  const c = (navigator as any).connection;
  if (!c) return false;
  if (c.saveData === true) return true;
  return c.effectiveType === "2g" || c.effectiveType === "slow-2g";
}

/**
 * Contextual guest imagery with a graceful, token-only fallback.
 *
 * - Data-saver, 2g or offline: never fetches the photo, renders the tinted
 *   gradient instead. Text stays fully readable either way.
 * - Decode failures fall back to the same gradient rather than a broken frame.
 * - Lazy + async decode so it never blocks the first useful paint.
 */
export function ContextImage({
  src,
  alt,
  className,
  aspectClass = "aspect-[16/6]",
  tintClass,
  children,
}: Props) {
  const [light, setLight] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLight(prefersLightData());
    const onChange = () => setLight(prefersLightData());
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  const showPhoto = !light && !failed;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted",
        aspectClass,
        className,
      )}
    >
      {showPhoto && (
        <img
          src={src}
          alt={alt}
          width={1280}
          height={640}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      <div className={cn("absolute inset-0", tintClass ?? "journey-tint-calm")} aria-hidden="true" />
      {children && <div className="relative h-full w-full">{children}</div>}
    </div>
  );
}
