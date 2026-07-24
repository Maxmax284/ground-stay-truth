// LMT CampStay service worker — v2 (post-rebrand from GroundStay)
// Bumping the version comment forces browsers to fetch this file byte-diff
// and re-activate, which clears any stale GroundStay-era caches below.
importScripts('/sw-push.js');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Non-destructive activation: wipe any lingering caches from the previous
  // GroundStay build so the new LMT CampStay shell/manifest is fetched fresh,
  // but do NOT claim clients or navigate open tabs (that would blow away
  // in-progress form state on tab return).
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  })());
});