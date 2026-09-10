"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";
import { areaM2 } from "@/lib/format";
import { subirFoto } from "@/lib/supabase/subir-foto";

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


export async function crearSobrante(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const ancho = numero(formData, "ancho_cm");
  const alto = numero(formData, "alto_cm");
  const materialId = texto(formData, "material_id");
  const color = texto(formData, "color");
  const grosor = numero(formData, "grosor_mm");

  if (ancho === null || ancho <= 0 || alto === null || alto <= 0) {
    return { error: "Escribe un ancho y un alto mayores que cero.", ok: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a entrar.", ok: false };

  // El tenant se lee del perfil porque hace falta para la ruta del Storage:
  // las políticas del bucket exigen que la carpeta raíz sea el tenant_id.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return { error: "Tu usuario no tiene tenant asignado.", ok: false };
  }

  const foto = await subirFoto(
    supabase,
    formData.get("foto"),
    perfil.tenant_id,
  );
  if (foto.error) return { error: foto.error, ok: false };
  const fotoUrl = foto.ruta;

  // El costo del sobrante es su área por el precio del material, que es
  // exactamente el dinero que se recupera al reutilizarlo en vez de tirarlo.
  let costoEstimado: number | null = null;
  if (materialId) {
    const { data: material } = await supabase
      .from("materials")
      .select("costo_unitario, unidad")
      .eq("id", materialId)
      .maybeSingle();

    if (material) {
      costoEstimado =
        material.unidad === "m2"
          ? areaM2(ancho, alto) * material.costo_unitario
          : material.costo_unitario;
    }
  }

  const { error } = await supabase.from("inventory_items").insert({
    tenant_id: perfil.tenant_id,
    material_id: materialId || null,
    ancho_cm: ancho,
    alto_cm: alto,
    grosor_mm: grosor,
    color: color || null,
    foto_url: fotoUrl,
    costo_estimado: costoEstimado,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath("/inventario");
  return { error: null, ok: true, marca: Date.now() };
}

/**
 * Marca un sobrante como usado y registra el ahorro.
 *
 * Este es el corazón de la promesa: reutilizar un sobrante evita comprar
 * material nuevo, y ese dinero evitado entra en savings, que es lo que el
 * dashboard suma para el ROI Circular.
 */
export async function marcarUsado(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!id) return;

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, costo_estimado, usado, ancho_cm, alto_cm")
    .eq("id", id)
    .maybeSingle();

  if (!item || item.usado) return;

  const { error } = await supabase
    .from("inventory_items")
    .update({ usado: true })
    .eq("id", id);

  if (error) return;

  const tenantId = await obtenerTenantId();

  if (tenantId && item.costo_estimado && item.costo_estimado > 0) {
    await supabase.from("savings").insert({
      tenant_id: tenantId,
      tipo: "reutilizacion",
      monto: item.costo_estimado,
      descripcion: `Sobrante reutilizado de ${item.ancho_cm}×${item.alto_cm} cm`,
    });
  }

  revalidatePath("/inventario");
  revalidatePath("/dashboard");
}

export async function eliminarSobrante(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("foto_url")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("inventory_items").delete().eq("id", id);

  // La foto se borra después: si falla el delete de la fila, no queremos
  // haber perdido ya la imagen.
  if (item?.foto_url) {
    await supabase.storage.from("sobrantes").remove([item.foto_url]);
  }

  revalidatePath("/inventario");
}
