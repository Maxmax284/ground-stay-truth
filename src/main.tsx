import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Guard: prevent service worker registration in iframes/preview
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else {
  navigator.serviceWorker?.register("/sw.js", { scope: "/" }).then((reg) => {
    reg.update();
  });

  // Reload once per controllerchange event (not once per session).
  // iOS users keep tabs alive for days — sessionStorage gating broke repeat updates.
  let reloadingForNewSW = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloadingForNewSW) return;
    reloadingForNewSW = true;
    window.location.reload();
  });

  const checkForUpdate = () => {
    navigator.serviceWorker?.getRegistration().then((reg) => reg?.update());
  };

  // Background timers are throttled/frozen on iOS, so this is best-effort.
  setInterval(checkForUpdate, 5 * 60 * 1000);

  // Fires when tab is foregrounded.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });

  // Critical for iOS Safari: pageshow fires on bfcache restore (swipe-back,
  // tab switch, app resume) when visibilitychange may not. event.persisted
  // === true means the page came from bfcache and likely missed updates.
  window.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) checkForUpdate();
  });

  // Also re-check when network comes back (iOS spotty wifi / cell handoff).
  window.addEventListener("online", checkForUpdate);
}

// Listen for NOTIFICATION_CLICK from service worker to handle deep-link routing
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "NOTIFICATION_CLICK" && event.data.route) {
    window.location.href = event.data.route;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
