// stayCacheBust
// -----------------------------------------------------------------------------
// Lightweight cache-bust for the public /stay page after staff edits pricing
// rules or policy settings.
//
// Strategy:
//   - Bump a `stay_cache_v` key in localStorage.
//   - Broadcast via the `storage` event AND a BroadcastChannel so other
//     tabs/windows on the same origin (staff dashboard + /stay preview)
//     see the change.
//   - /stay reads the value and appends it as a `?v=<version>` query param
//     on its get-availability fetches, so its own HTTP cache misses.
//   - Edge cache (Cloudflare/Supabase) has s-maxage=60, so guest browsers
//     may serve up to ~1 minute of stale data — the staff toast makes that
//     visible instead of surprising them later.
// -----------------------------------------------------------------------------
import { toast } from "sonner";

const KEY = "stay_cache_v";
const CHANNEL = "stay-cache-bust";

export function getStayCacheVersion(): string {
  try {
    return localStorage.getItem(KEY) ?? "0";
  } catch {
    return "0";
  }
}

export function bumpStayCacheVersion(reason: string) {
  const v = String(Date.now());
  try {
    localStorage.setItem(KEY, v);
  } catch { /* quota */ }
  try {
    new BroadcastChannel(CHANNEL).postMessage({ v, reason });
  } catch { /* older browsers */ }

  toast.success("Public /stay refreshed", {
    description:
      "Guests already on the page may see cached prices for up to ~1 minute. If someone reports old numbers, ask them to hard-refresh (Ctrl/Cmd + Shift + R).",
    duration: 8000,
  });
}

/** Subscribe to cache-bust broadcasts from other tabs. Returns unsubscribe. */
export function subscribeToStayCacheBust(cb: (v: string) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) cb(e.newValue);
  };
  window.addEventListener("storage", onStorage);

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => {
      if (e.data?.v) cb(String(e.data.v));
    };
  } catch { /* older browsers */ }

  return () => {
    window.removeEventListener("storage", onStorage);
    try { bc?.close(); } catch { /* noop */ }
  };
}
