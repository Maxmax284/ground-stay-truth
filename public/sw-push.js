// Custom push event handler for Ground Stay PWA
// This file is imported by the Workbox-generated service worker

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      data = { title: "Ground Stay", body: event.data?.text() || "New notification" };
    } catch (_) {
      data = { title: "Ground Stay", body: "New notification" };
    }
  }

  const title = data.title || "Ground Stay";
  const body = data.body || "";
  const type = data.type || data.tag || "";
  const referenceId = data.reference_id || data.referenceId || "";
  const route = data.route || data.url || "";
  const tag = data.tag || type || "gs-notification";

  // Check if any client (window) is currently focused/visible
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const focusedClient = clients.find(
        (c) => c.visibilityState === "visible" && c.focused
      );

      if (focusedClient) {
        // App is in foreground — send message to client, skip OS notification
        focusedClient.postMessage({
          type: "FOREGROUND_PUSH",
          payload: {
            title,
            body,
            type,
            tag,
            referenceId,
            route,
            icon: data.icon || "/pwa-notification-icon.png",
          },
        });
        return;
      }

      // App is backgrounded or closed — show OS notification
      return self.registration.showNotification(title, {
        body,
        icon: data.icon || "/pwa-notification-icon.png",
        badge: data.badge || "/pwa-notification-icon.png",
        tag,
        data: { url: route || "/", type, referenceId },
        vibrate: [200, 100, 200],
      });
    })
  );
});

// Handle notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing window
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICK",
            route: url,
          });
          return;
        }
      }
      // No existing window — open new
      return self.clients.openWindow(url);
    })
  );
});
