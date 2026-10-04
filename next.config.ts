import type { NextConfig } from "next";

/**
 * Política de contenido, SOLO EN MODO REPORTE: el navegador anota en la consola
 * lo que bloquearía, pero no bloquea nada. Se revisa durante el piloto y, cuando
 * no queden avisos legítimos, se cambia la cabecera a Content-Security-Policy.
 * 'unsafe-inline'/'unsafe-eval' hacen falta hoy por los scripts en línea de
 * Next (y el modo desarrollo); se endurecen con nonces más adelante.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // blob:/data: por la vista previa y compresión de fotos; Supabase por las
  // URLs firmadas de Storage.
  "img-src 'self' blob: data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const CABECERAS_SEGURIDAD = [
  // Impide que otro sitio incruste la app en un iframe (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Impide que el navegador adivine el tipo de un archivo y lo ejecute.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtra rutas ni parámetros de la app a otros sitios al salir por un enlace.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactiva micrófono y ubicación; la cámara queda sólo para la propia app (fotos).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Obliga a usar HTTPS durante 2 años (evita degradación a HTTP).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Detecta (sin bloquear) cargas de scripts/recursos no previstos: XSS, inyecciones.
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: CABECERAS_SEGURIDAD },
      // El service worker de los avisos push: que el navegador siempre tome la
      // versión nueva al publicar un cambio.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Las fotos de celular pesan varios MB y el límite por defecto es 1 MB,
      // que cortaba la petición antes de llegar a la validación de tamaño.
      // El cliente además comprime la imagen antes de enviarla, así que este
      // margen es la red de seguridad, no el caso normal.
      bodySizeLimit: "8mb",
    },
  },
  turbopack: {
    resolveAlias: {
      // @techstark/opencv-js trae una rama `require("fs")` para cuando corre
      // en Node, que nunca se ejecuta en el navegador (queda detrás de un
      // `if (ENVIRONMENT_IS_NODE)`). Turbopack igual la resuelve al analizar
      // el bundle del cliente y el build falla sin este alias.
      fs: { browser: "./src/lib/opencv/fs-stub.js" },
    },
  },
};

export default nextConfig;
