self.addEventListener("push", (event) => {
  let payload = { title: "Chamados", body: "", url: "/app.html" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Chamados", {
      body: payload.body || "",
      icon: "/chamados-icon-192.png",
      data: { url: payload.url || "/app.html" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/app.html";
  const absolute = new URL(target, self.location.origin).href;
  event.waitUntil(clients.openWindow(absolute));
});
