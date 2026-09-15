"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { costoPorM2 } from "@/lib/lamina";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { texto, numero } from "@/lib/form-data";
import type { Unidad } from "@/types/database";

const UNIDADES: readonly Unidad[] = ["m2", "unidad", "metro_lineal"];

export async function crearMaterial(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const tipo = texto(formData, "tipo");
  const color = texto(formData, "color");
  const grosor = numero(formData, "grosor_mm");
  const unidadCruda = texto(formData, "unidad");
  const ancho = numero(formData, "ancho_cm");
  const alto = numero(formData, "alto_cm");
  const costoLamina = numero(formData, "costo_lamina");
  const stock = numero(formData, "stock_laminas") ?? 0;

  if (!tipo) return { error: "El tipo de material es obligatorio.", ok: false };

  const unidad = UNIDADES.includes(unidadCruda as Unidad)
    ? (unidadCruda as Unidad)
    : "m2";

  // Con medidas y precio de lámina se deriva el precio por m². Sin ellos se
  // acepta el precio por m² escrito a mano, para materiales que no vienen en
  // láminas.
  const porM2 = costoPorM2({
    anchoCm: ancho,
    altoCm: alto,
    costoLamina,
  });
  const costo = porM2 ?? numero(formData, "costo_unitario");

  if (costo === null || costo < 0) {
    return {
      error:
        "Escribe el tamaño y el precio de la lámina, o el precio por unidad si el material no viene en láminas.",
      ok: false,
    };
  }
  if (stock < 0) {
    return { error: "Las existencias no pueden ser negativas.", ok: false };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();
  // tenant_id va explícito: las tablas no tienen default y RLS rechaza el
  // insert si falta.
  const { error } = await supabase.from("materials").insert({
    tenant_id: tenantId,
    tipo,
    color: color || null,
    grosor_mm: grosor,
    costo_unitario: costo,
    unidad,
    ancho_cm: ancho,
    alto_cm: alto,
    costo_lamina: costoLamina,
    stock_laminas: stock,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath("/materiales");
  return { error: null, ok: true, marca: Date.now() };
}

export async function eliminarMaterial(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("materials").delete().eq("id", id);
  revalidatePath("/materiales");
}

/**
 * Suma o resta láminas al stock de un material.
 *
 * Se usa para reponer tras una compra y para corregir a mano. El stock nunca
 * baja de cero: la restricción de la base lo rechazaría.
 */
export async function ajustarStock(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const delta = numero(formData, "delta");
  if (!id || delta === null || delta === 0) return;

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("materials")
    .select("stock_laminas")
    .eq("id", id)
    .maybeSingle();

  if (!material) return;

  const nuevo = Math.max(material.stock_laminas + delta, 0);
  await supabase
    .from("materials")
    .update({ stock_laminas: nuevo })
    .eq("id", id);

  revalidatePath("/materiales");
}
