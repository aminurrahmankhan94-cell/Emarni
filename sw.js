// Emarni service worker: shows notifications on phones and desktops, and opens or focuses the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.length) {
        await windows[0].focus();
        return;
      }
      await self.clients.openWindow("./");
    })()
  );
});
