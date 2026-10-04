/*
 * Service worker de ECO-SIGN: recibe los avisos push y los muestra, aunque la
 * app esté cerrada. No guarda nada en caché (la app no funciona sin conexión).
 *
 * El aviso llega como JSON { id, titulo, cuerpo, url } desde
 * src/lib/notificaciones/push.ts.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(datos.titulo || "ECO-SIGN", {
        body: datos.cuerpo || "",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        lang: "es",
        tag: datos.id || undefined,
        data: { url: datos.url || "/dashboard" },
      });
      // Si la app está abierta, la campanita se actualiza al momento.
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const ventana of ventanas) ventana.postMessage({ tipo: "notificacion", titulo: datos.titulo, cuerpo: datos.cuerpo });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ruta = (event.notification.data && event.notification.data.url) || "/dashboard";
  // Sólo rutas de la propia app.
  const destino = new URL(ruta.startsWith("/") ? ruta : "/dashboard", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin && "focus" in ventana) {
          await ventana.focus();
          if ("navigate" in ventana) await ventana.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
