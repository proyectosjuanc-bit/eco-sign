"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";
import { areaM2 } from "@/lib/format";
import { subirFoto } from "@/lib/supabase/subir-foto";
import { texto, numero } from "@/lib/form-data";
import { formatearCodigo } from "@/lib/codigos";


export async function crearSobrante(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const materialId = texto(formData, "material_id");
  const color = texto(formData, "color");
  const grosor = numero(formData, "grosor_mm");
  const jobId = texto(formData, "job_id");

  // inventory_items.material_id es NOT NULL en la base, aunque el tipo lo
  // admita nulo — descubierto probando un insert real. Sin esto, el
  // formulario dejaba elegir "Sin material" y el insert fallaba con un error
  // de Postgres poco claro para quien lo usa.
  if (!materialId) {
    return { error: "Elige el material del sobrante.", ok: false };
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

  // El código se pide antes de subir la foto: si el contador fallara, no
  // queremos haber dejado ya una imagen huérfana en el bucket.
  const { data: numeroCodigo, error: errorCodigo } = await supabase.rpc(
    "siguiente_contador",
    { p_tenant_id: perfil.tenant_id, p_tipo: "sobrante" },
  );
  if (errorCodigo || numeroCodigo === null) {
    return {
      error: "No se pudo generar el código del sobrante. Intenta de nuevo.",
      ok: false,
    };
  }
  const codigo = formatearCodigo("SOB", numeroCodigo);

  const foto = await subirFoto(
    supabase,
    formData.get("foto"),
    perfil.tenant_id,
  );
  if (foto.error) return { error: foto.error, ok: false };
  const fotoUrl = foto.ruta;

  const { data: material } = await supabase
    .from("materials")
    .select("costo_unitario, unidad")
    .eq("id", materialId)
    .maybeSingle();

  // Un material "por unidad" (tornillos, luces LED, estructuras…) no deja un
  // retal con medidas: lo que sobra es un número de piezas sueltas. Se pide
  // la cantidad en vez de ancho/alto, y ancho_cm/alto_cm quedan en 1×1 como
  // valor neutro (son NOT NULL en la base), igual que ya se hace en
  // job_items para el mismo tipo de material.
  const porUnidad = material?.unidad === "unidad";

  let ancho: number;
  let alto: number;
  let cantidad: number;

  if (porUnidad) {
    const cantidadForm = numero(formData, "cantidad");
    if (cantidadForm === null || cantidadForm <= 0) {
      return { error: "Escribe cuántas unidades sobraron.", ok: false };
    }
    ancho = 1;
    alto = 1;
    cantidad = Math.round(cantidadForm);
  } else {
    const anchoForm = numero(formData, "ancho_cm");
    const altoForm = numero(formData, "alto_cm");
    if (anchoForm === null || anchoForm <= 0 || altoForm === null || altoForm <= 0) {
      return { error: "Escribe un ancho y un alto mayores que cero.", ok: false };
    }
    ancho = anchoForm;
    alto = altoForm;
    cantidad = 1;
  }

  // El costo del sobrante es lo que se recupera al reutilizarlo en vez de
  // tirarlo: área × precio por m² para una lámina, o cantidad × precio por
  // unidad para un material que no se corta.
  const costoEstimado = material
    ? material.unidad === "m2"
      ? areaM2(ancho, alto) * material.costo_unitario
      : material.costo_unitario * cantidad
    : null;

  const { error } = await supabase.from("inventory_items").insert({
    tenant_id: perfil.tenant_id,
    material_id: materialId,
    ancho_cm: ancho,
    alto_cm: alto,
    cantidad,
    grosor_mm: porUnidad ? null : grosor,
    color: color || null,
    foto_url: fotoUrl,
    costo_estimado: costoEstimado,
    job_id: jobId || null,
    codigo,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath("/inventario");
  if (jobId) revalidatePath(`/trabajos/${jobId}`);
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
    .select("id, costo_estimado, usado, ancho_cm, alto_cm, cantidad")
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
    const descripcion =
      item.cantidad > 1
        ? `Sobrante reutilizado de ${item.cantidad} unidades`
        : `Sobrante reutilizado de ${item.ancho_cm}×${item.alto_cm} cm`;
    await supabase.from("savings").insert({
      tenant_id: tenantId,
      tipo: "reutilizacion",
      monto: item.costo_estimado,
      descripcion,
    });
  }

  revalidatePath("/inventario");
  revalidatePath("/dashboard");
}

/**
 * Vende un sobrante tal cual, sin cortarlo.
 *
 * Es un ingreso, no un ahorro: va a `sales`, no a `savings`, para no inflar
 * el ROI Circular del dashboard con dinero que entró en vez de dinero que se
 * dejó de gastar.
 */
export async function venderSobrante(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const id = texto(formData, "id");
  const monto = numero(formData, "monto");
  const descripcion = texto(formData, "descripcion");

  if (!id) return { error: "Falta el sobrante.", ok: false };
  if (monto === null || monto <= 0) {
    return { error: "Escribe cuánto cobraste por el sobrante.", ok: false };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: "Tu sesión expiró. Vuelve a entrar.", ok: false };

  const supabase = await createClient();

  // La condición usado=false va en el propio update, no en un select previo:
  // así el chequeo es atómico y no hay ventana en la que dos personas puedan
  // vender el mismo sobrante a la vez. Si la fila no cambia, data vuelve
  // vacío (no es un error de Postgres, es un array de cero filas).
  const { data: filasActualizadas, error: errorUsado } = await supabase
    .from("inventory_items")
    .update({ usado: true })
    .eq("id", id)
    .eq("usado", false)
    .select("id");

  if (errorUsado) return { error: errorUsado.message, ok: false };
  if (!filasActualizadas?.length) {
    return { error: "Este sobrante ya fue usado o vendido.", ok: false };
  }

  const { error } = await supabase.from("sales").insert({
    tenant_id: tenantId,
    inventory_item_id: id,
    monto,
    descripcion: descripcion || null,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath("/inventario");
  return { error: null, ok: true, marca: Date.now() };
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
