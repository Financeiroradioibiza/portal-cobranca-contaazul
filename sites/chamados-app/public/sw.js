/* Service worker — IbiZap Chamados (Web Push). */
self.addEventListener("push", (event) => {
  let payload = { title: "IbiZap", body: "", url: "/app.html" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "IbiZap", {
      body: payload.body || "",
      icon: "/chamados-icon-192.png",
      badge: "/chamados-icon-192.png",
      tag: payload.tag || "ibizap-chamados",
      renotify: true,
      data: { url: payload.url || "/app.html" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || "/app.html";
  const absolute =
    typeof raw === "string" && raw.startsWith("http") ? raw : new URL(raw, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url && c.url.indexOf(self.location.origin) === 0) {
          c.navigate(absolute);
          return c.focus();
        }
      }
      return clients.openWindow(absolute);
    }),
  );
});
