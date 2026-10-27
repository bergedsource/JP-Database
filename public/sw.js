// Acacia JP service worker: shows ticket push alerts. Nothing is cached.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Acacia JP", {
      body: data.body || "",
      tag: data.tag,
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Tap: bring an open JP tab forward (the homepage reopens his ticket), else open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
