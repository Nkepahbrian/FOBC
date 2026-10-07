self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "FOBC";
  const options = {
    body: payload.body || "You have a new blessing.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "fobc",
    renotify: true,
    data: { url: payload.url || "/notifications" },
    vibrate: [90, 40, 140],
    silent: false,
  };

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      windows.forEach((client) => client.postMessage({ type: "fobc-chime" }));
      const focused = windows.some((client) => client.visibilityState === "visible" && client.focused);
      if (!focused) await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("navigate" in client) {
          await client.navigate(target);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
