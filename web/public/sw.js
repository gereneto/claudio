// Service worker do Claudio: só notificações push (sem cache, para nunca servir versão velha).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let dados = { titulo: "Claudio", corpo: "", url: "/", etiqueta: "claudio" };
  try {
    dados = { ...dados, ...e.data.json() };
  } catch {
    dados.corpo = e.data ? e.data.text() : "";
  }
  e.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      tag: dados.etiqueta,
      icon: "/icone.svg",
      badge: "/icone.svg",
      data: { url: dados.url },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin)) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
