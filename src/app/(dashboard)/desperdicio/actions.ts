"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { areaM2 } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { subirFoto } from "@/lib/supabase/subir-foto";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function numero(formData: FormData, campo: string): number | null {
  const crudo = texto(formData, campo).replace(",", ".");
  if (!crudo) return null;
  const valor = Number(crudo);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Registra material desperdiciado.
 *
 * Medir el desperdicio es lo que hace creíble el ahorro: sin la línea base no
 * hay con qué comparar la mejora.
 */
export async function registrarDesperdicio(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const materialId = texto(formData, "material_id");
  const motivo = texto(formData, "motivo");
  const ancho = numero(formData, "ancho_cm");
  const alto = numero(formData, "alto_cm");

  // Con medidas se calcula la cantidad; si no, se acepta escrita a mano, para
  // materiales que se cuentan por unidad.
  const cantidad =
    ancho !== null && alto !== null && ancho > 0 && alto > 0
      ? areaM2(ancho, alto)
      : numero(formData, "cantidad");

  // material_id es NOT NULL: sin material no hay precio con el que valorar la
  // pérdida, que es justamente el dato que se quiere medir.
  if (!materialId) {
    return { error: "Elige el material que se perdió.", ok: false };
  }
  if (cantidad === null || cantidad <= 0) {
    return {
      error: "Escribe el ancho y el alto de lo que se perdió, o la cantidad.",
      ok: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a entrar.", ok: false };

  // El tenant hace falta dos veces: para el insert y para la ruta del Storage.
  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  let costo: number | null = null;
  const { data: material } = await supabase
    .from("materials")
    .select("costo_unitario")
    .eq("id", materialId)
    .maybeSingle();
  if (material) costo = material.costo_unitario * cantidad;

  const foto = await subirFoto(
    supabase,
    formData.get("foto"),
    tenantId,
    "desperdicio-",
  );
  if (foto.error) return { error: foto.error, ok: false };
  const fotoUrl = foto.ruta;

  const { error } = await supabase.from("waste_logs").insert({
    tenant_id: tenantId,
    material_id: materialId,
    cantidad,
    motivo: motivo || null,
    foto_url: fotoUrl,
    costo,
    ancho_cm: ancho,
    alto_cm: alto,
    job_id: texto(formData, "job_id") || null,
    origen: "manual",
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath("/desperdicio");
  revalidatePath("/dashboard");
  return { error: null, ok: true, marca: Date.now() };
}

export async function eliminarDesperdicio(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  const { data: registro } = await supabase
    .from("waste_logs")
    .select("foto_url")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("waste_logs").delete().eq("id", id);

  if (registro?.foto_url) {
    await supabase.storage.from("sobrantes").remove([registro.foto_url]);
  }

  revalidatePath("/desperdicio");
  revalidatePath("/dashboard");
}
