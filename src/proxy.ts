import type { NextRequest } from "next/server";

import { actualizarSesion } from "@/lib/supabase/middleware";

/**
 * Proxy de Next 16 (antes `middleware.ts`).
 *
 * Corre antes de renderizar cualquier ruta: refresca la sesión de Supabase y
 * redirige a /login las rutas privadas sin sesión.
 */
export async function proxy(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  // Se excluyen estáticos, imágenes optimizadas y ficheros con extensión para
  // no gastar una llamada a Auth en cada asset.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)",
  ],
};
