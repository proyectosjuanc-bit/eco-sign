import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { firmarFotos } from "@/lib/supabase/subir-foto";
import type { Database } from "@/types/database";

/**
 * Lecturas compartidas por las páginas de Capacidad. Sólo servidor: usan el
 * cliente con la sesión del usuario, así que todo pasa por RLS.
 */

/**
 * Nombre de otros talleres, indexado por id.
 *
 * `tenants` está cerrada a cada taller; la función `nombres_talleres` de la
 * migración sólo devuelve el nombre de talleres que están en la red (tienen
 * una máquina publicada) o que comparten una solicitud con quien pregunta.
 */
export async function nombresTalleres(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();

  const { data } = await supabase.rpc("nombres_talleres", { p_ids: unicos });
  return new Map((data ?? []).map((t) => [t.id, t.nombre]));
}

/**
 * URL firmada de la primera foto de cada máquina, indexada por ruta. La
 * política del bucket sólo deja firmar fotos propias o de máquinas
 * publicadas; las demás simplemente no vuelven en el mapa.
 */
export function firmarPortadas(
  supabase: SupabaseClient<Database>,
  maquinas: { fotos: string[] }[],
): Promise<Map<string, string>> {
  return firmarFotos(
    supabase,
    maquinas.map((m) => m.fotos[0] ?? null),
    "maquinas",
  );
}
