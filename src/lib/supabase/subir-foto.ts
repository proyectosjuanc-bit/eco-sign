import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/** Tope de subida: las fotos de móvil rara vez pasan de 5 MB. */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

export type ResultadoFoto =
  | { ruta: string | null; error: null }
  | { ruta: null; error: string };

/**
 * Sube una foto al bucket "sobrantes" y devuelve su ruta.
 *
 * Las políticas del bucket exigen que la primera carpeta sea el tenant, así que
 * la ruta siempre es `{tenantId}/{prefijo}{uuid}.{ext}`. Se guarda la ruta y no
 * una URL firmada porque las firmas caducan.
 *
 * Un campo vacío no es un error: devuelve ruta null para que el llamador guarde
 * la fila sin foto.
 */
export async function subirFoto(
  supabase: SupabaseClient<Database>,
  archivo: FormDataEntryValue | null,
  tenantId: string,
  prefijo = "",
): Promise<ResultadoFoto> {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ruta: null, error: null };
  }
  if (archivo.size > MAX_FOTO_BYTES) {
    return { ruta: null, error: "La foto supera los 5 MB." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ruta: null, error: "El archivo debe ser una imagen." };
  }

  const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const ruta = `${tenantId}/${prefijo}${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("sobrantes")
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

  if (error) {
    return { ruta: null, error: `No se pudo subir la foto: ${error.message}` };
  }

  return { ruta, error: null };
}

/** Vigencia de las URLs firmadas: una hora basta para ver una página. */
export const VIGENCIA_FIRMA = 60 * 60;

/**
 * Firma varias rutas de golpe y las devuelve indexadas por ruta.
 *
 * El bucket es privado, así que cada foto necesita firma. Se piden todas en una
 * sola llamada en lugar de una por fila.
 */
export async function firmarFotos(
  supabase: SupabaseClient<Database>,
  rutas: (string | null)[],
): Promise<Map<string, string>> {
  const limpias = rutas.filter((ruta): ruta is string => Boolean(ruta));
  const firmas = new Map<string, string>();

  if (!limpias.length) return firmas;

  const { data } = await supabase.storage
    .from("sobrantes")
    .createSignedUrls(limpias, VIGENCIA_FIRMA);

  for (const firma of data ?? []) {
    if (firma.path && firma.signedUrl) firmas.set(firma.path, firma.signedUrl);
  }

  return firmas;
}
