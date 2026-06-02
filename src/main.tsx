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

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (!sessionStorage.getItem("sw-controller-refreshed")) {
      sessionStorage.setItem("sw-controller-refreshed", "1");
      window.location.reload();
    }
  });

  // Force check for SW updates every 5 minutes so published changes propagate fast
  setInterval(() => {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      reg?.update();
    });
  }, 5 * 60 * 1000);

  // Also check immediately on page visibility change (user returns to app)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      navigator.serviceWorker?.getRegistration().then((reg) => {
        reg?.update();
      });
    }
  });
}

// Listen for NOTIFICATION_CLICK from service worker to handle deep-link routing
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type === "NOTIFICATION_CLICK" && event.data.route) {
    window.location.href = event.data.route;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
