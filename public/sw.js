importScripts('/sw-push.js');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Non-destructive activation: clean stale caches, but do NOT claim clients
  // or navigate open tabs. Forcing client.navigate() reloads every open tab
  // the moment a new SW activates, wiping in-progress form state. The new
  // SW will take control naturally on the user's next manual navigation.
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  })());
});