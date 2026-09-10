import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase para componentes con "use client".
 *
 * Lee la sesión de las cookies que escribe el proxy, así que el usuario
 * autenticado en el servidor también lo está en el navegador. Se puede llamar
 * en cada render: la librería reutiliza la instancia por debajo.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
