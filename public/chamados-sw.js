/* Service worker — PWA Chamados (push + abrir /m/chamados). */
self.addEventListener("push", (event) => {
  let payload = { title: "Chamados", body: "", url: "/m/chamados" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Chamados", {
      body: payload.body || "",
      icon: "/chamados-icon-192.png",
      badge: "/chamados-icon-192.png",
      data: { url: payload.url || "/m/chamados" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/m/chamados";
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil(clients.openWindow(absolute));
});
