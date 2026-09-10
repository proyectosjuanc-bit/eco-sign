import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/** Rutas que exigen sesión iniciada. */
const RUTAS_PROTEGIDAS = [
  "/dashboard",
  "/materiales",
  "/inventario",
  "/trabajos",
  "/desperdicio",
  "/guia",
];

/** Rutas de auth: quien ya tiene sesión no debería verlas. */
const RUTAS_AUTH = ["/login", "/register"];

/**
 * Refresca la sesión de Supabase y aplica las reglas de acceso.
 *
 * Los tokens de Supabase caducan; sin este refresco en cada petición la sesión
 * se caería a mitad de navegación. La respuesta se construye antes de llamar a
 * getUser() para que las cookies renovadas viajen tanto a la petición (y las
 * vean los Server Components) como al navegador.
 */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // No insertar lógica entre createServerClient y getUser(): getUser() es lo
  // que dispara el refresco del token y la reescritura de cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esProtegida = RUTAS_PROTEGIDAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
  const esAuth = RUTAS_AUTH.some((ruta) => pathname.startsWith(ruta));

  if (!user && esProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Se recuerda el destino para volver ahí tras iniciar sesión.
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && esAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
