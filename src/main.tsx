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

  // IMPORTANT: do NOT auto-reload on controllerchange.
  // Auto-reloading destroys in-progress form state (API keys, edits, etc.)
  // whenever the user returns to the tab and an update is pending. The new
  // service worker will take control naturally on the user's next manual
  // navigation or refresh.

  // Background update check only — never forces a reload, never runs on
  // visibilitychange / pageshow / online (those events fire constantly when
  // the user tabs back, which is exactly when we must NOT disturb them).
  setInterval(() => {
    navigator.serviceWorker?.getRegistration().then((reg) => reg?.update());
  }, 30 * 60 * 1000);
}

// Listen for NOTIFICATION_CLICK from service worker to handle deep-link routing
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "NOTIFICATION_CLICK" && event.data.route) {
    window.location.href = event.data.route;
  }
});

const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const searchParams = new URLSearchParams(window.location.search);
const isPasswordRecoveryLink =
  hashParams.get("type") === "recovery" ||
  searchParams.get("type") === "recovery" ||
  (window.location.pathname === "/auth" && hashParams.has("access_token") && hashParams.has("refresh_token"));

if (isPasswordRecoveryLink && window.location.pathname !== "/reset-password") {
  window.history.replaceState(
    null,
    "",
    `/reset-password${window.location.search}${window.location.hash}`,
  );
}

createRoot(document.getElementById("root")!).render(<App />);
