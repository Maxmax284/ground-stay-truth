## Problem

When you switch tabs and return, the staff app reloads and you lose in-progress edits (API keys, form fields, etc.).

The previous fix to `src/main.tsx` removed the client-side auto-reload, but the real cause is in `public/sw.js`:

```js
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.map((client) => client.navigate(client.url))); // ← force-reloads every open tab
  })());
});
```

Every time the SW updates and activates, it navigates every open tab back to its current URL, which is a full reload and destroys React state.

## Fix

Edit `public/sw.js` so activation is non-destructive:

1. Keep `skipWaiting` on install — fine, just promotes the new worker to "waiting → active".
2. Keep cache cleanup on activate — safe, only deletes stale caches.
3. Remove the `clients.claim()` + `clients.navigate(client.url)` block. The new SW will naturally take control on the user's next real navigation or manual refresh. Open tabs keep their state.

Resulting activate handler:

```js
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  })());
});
```

No other files change. `sw-push.js`, push notifications, and the message listener in `main.tsx` are unaffected.

## Caveat

Because service workers are cached by the browser, the *current* broken SW is still installed on your device. After this ships, you'll need to do one final manual hard refresh (or close + reopen the tab) so the new `sw.js` activates. After that, future updates won't touch your open tabs.
