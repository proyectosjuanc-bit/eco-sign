/**
 * Manifest de la PWA, servido desde una Route Handler.
 *
 * Con esto la app se puede instalar en el móvil y abrirse a pantalla completa,
 * que es como la usa el operario en el taller. Se arranca en /dashboard porque
 * quien instala la app ya tiene cuenta.
 */
export function GET() {
  return Response.json({
    name: "ECO-SIGN",
    short_name: "ECO-SIGN",
    description:
      "Reduce el desperdicio y reutiliza sobrantes: tu desperdicio paga el software.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#059669",
    orientation: "portrait",
    lang: "es",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  });
}
