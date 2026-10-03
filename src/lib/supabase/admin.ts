import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase con la service role key: se SALTA el RLS.
 *
 * ⚠️ SOLO SERVIDOR (lo impone `server-only`). Úsalo únicamente para lecturas
 * que el usuario no puede hacer por RLS y que no devuelven datos sensibles al
 * navegador. Nunca para escribir en nombre del usuario.
 *
 * Devuelve null si falta alguna variable de entorno, para que quien lo llame
 * pueda seguir sin él en vez de romper (por ejemplo si SUPABASE_SERVICE_ROLE_KEY
 * todavía no está configurada en Vercel).
 */
export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;

  return createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
