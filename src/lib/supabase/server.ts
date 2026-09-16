import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * ⚠️ SOLO SERVIDOR, impuesto por el import de `server-only`. Aquí la clave no
 * es el secreto —la anon key es pública por diseño—: lo que no puede cruzar al
 * navegador es `cookies()` de `next/headers`, y sobre todo el hecho de que
 * este cliente actúa con la sesión del usuario. Para el navegador existe
 * `client.ts`, que monta el suyo propio. Mezclarlos daría un cliente que en el
 * navegador cree tener la sesión del servidor.
 *
 * En Next 16 `cookies()` es asíncrono, por eso la función es async y hay que
 * await-earla en cada uso. Todas las consultas viajan con el JWT del usuario,
 * de modo que RLS y `current_tenant_id()` filtran por tenant sin que ninguna
 * consulta tenga que mencionar el tenant.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un Server Component no puede escribir cookies. El refresco de
            // sesión ya lo hace el proxy, así que se puede ignorar sin riesgo.
          }
        },
      },
    },
  );
}

/**
 * Devuelve el usuario autenticado o null.
 *
 * Usa getUser() y no getSession(): getUser() valida el token contra el
 * servidor de Auth, mientras que getSession() confía en la cookie.
 */
export async function getUsuarioActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
