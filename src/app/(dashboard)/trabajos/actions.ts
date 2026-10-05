"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { areaM2 } from "@/lib/format";
import { esPorArea, valorItem } from "@/lib/inventario";
import { subirFoto } from "@/lib/supabase/subir-foto";
import { texto, numero } from "@/lib/form-data";
import { formatearCodigo } from "@/lib/codigos";
import type { EstadoTrabajo } from "@/types/database";

/**
 * Trabajos con inventario único (ver 20261004_inventario_unico.sql).
 *
 * Un trabajo:
 *   1. SACA material del inventario (láminas completas, retales, metros o
 *      unidades) → job_items modo "salida". Usar un retal es ahorro.
 *   2. Registra las PIEZAS que entrega (medidas) → job_items modo "pieza".
 *   3. DEVUELVE lo que sobró como retal nuevo al inventario.
 *   4. Calcula los recortes perdidos: salidas − piezas − sobrantes devueltos.
 */

const ESTADOS: readonly EstadoTrabajo[] = ["pendiente", "en_proceso", "terminado"];

/** Mensaje claro cuando la base rechaza por permisos (rol de solo lectura). */
function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row-level security|Acceso denegado/i.test(error.message)) {
    return "Tu rol no permite registrar cambios. Pide a un administrador que lo haga.";
  }
  return "No pudimos guardar el cambio. Intenta de nuevo.";
}

export async function crearTrabajo(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const nombre = texto(formData, "nombre");
  const cliente = texto(formData, "cliente");
  const fecha = texto(formData, "fecha");

  if (!nombre) return { error: "El nombre del trabajo es obligatorio.", ok: false };

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").insert({
    tenant_id: tenantId,
    nombre,
    cliente: cliente || null,
    ...(fecha ? { fecha } : {}),
    estado: "pendiente",
  });

  if (error) {
    console.error("[trabajos] No se pudo crear el trabajo", error);
    return { error: mensajeError(error), ok: false };
  }

  revalidatePath("/trabajos");
  return { error: null, ok: true, marca: Date.now() };
}

// ---------------------------------------------------------------------------
// 1. Sacar del inventario
// ---------------------------------------------------------------------------

/**
 * Saca material del inventario para el trabajo.
 *
 * - Lámina completa: cuántas láminas (normalmente 1).
 * - Retal: sale entero; queda como usado y se registra el AHORRO (no se abrió
 *   una lámina nueva).
 * - Metros / unidades: cuánto se usó.
 *
 * El descuento es atómico en la base (sacar_inventario): si dos personas sacan
 * lo mismo a la vez, sólo una lo consigue.
 */
export async function sacarDelInventario(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const jobId = texto(formData, "job_id");
  const itemId = texto(formData, "inventory_item_id");
  const cantidadPedida = numero(formData, "cantidad");

  if (!jobId) return { error: "Falta el trabajo.", ok: false };
  if (!itemId) return { error: "Elige qué vas a sacar del inventario.", ok: false };

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, clase, material_id, ancho_cm, alto_cm, cantidad, costo_estimado, codigo, usado")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "Ese material ya no está en el inventario.", ok: false };

  const { data: material } = await supabase
    .from("materials")
    .select("costo_unitario, costo_lamina, unidad")
    .eq("id", item.material_id)
    .maybeSingle();

  // Cuánto sale: un retal siempre entero; lo demás, lo que se pidió.
  const cantidad = item.clase === "retal" ? 1 : cantidadPedida;
  if (cantidad === null || cantidad <= 0) {
    return {
      error:
        item.clase === "lamina"
          ? "Escribe cuántas láminas sacas."
          : item.clase === "metros"
            ? "Escribe cuántos metros usas."
            : item.clase === "mililitros"
              ? "Escribe cuántos ml usas."
              : "Escribe cuántas unidades usas.",
      ok: false,
    };
  }
  if (item.clase === "lamina" && !Number.isInteger(cantidad)) {
    return { error: "Las láminas completas se sacan enteras (1, 2, 3…).", ok: false };
  }

  const { data: restante, error: errorSacar } = await supabase.rpc("sacar_inventario", {
    p_inventory_item_id: item.id,
    p_cantidad: cantidad,
  });
  if (errorSacar) {
    console.error("[trabajos] No se pudo sacar del inventario", errorSacar);
    return { error: mensajeError(errorSacar), ok: false };
  }
  if (restante === null) {
    return {
      error:
        item.clase === "retal"
          ? "Ese retal ya fue usado o vendido."
          : "No hay tanta cantidad disponible en el inventario.",
      ok: false,
    };
  }

  const descripcion =
    item.clase === "retal"
      ? `Retal ${item.codigo ?? ""}`.trim()
      : item.clase === "lamina"
        ? "Lámina completa"
        : null;

  const { data: linea, error } = await supabase
    .from("job_items")
    .insert({
      job_id: jobId,
      material_id: item.material_id,
      inventory_item_id: item.id,
      modo: "salida",
      ancho_cm: item.ancho_cm,
      alto_cm: item.alto_cm,
      cantidad,
      descripcion,
    })
    .select("id")
    .single();

  if (error || !linea) {
    // No dejar el inventario descontado sin la línea que lo explica.
    await supabase.rpc("reponer_inventario", { p_inventory_item_id: item.id, p_cantidad: cantidad });
    console.error("[trabajos] No se pudo registrar la salida", error);
    return { error: error ? mensajeError(error) : "No pudimos registrar la salida.", ok: false };
  }

  // Usar un retal en vez de abrir material nuevo es ahorro: su valor no se
  // vuelve a comprar. Va ligado a la línea: si se quita, el ahorro se va.
  if (item.clase === "retal") {
    const monto = Number(valorItem(item, material ?? undefined).toFixed(2));
    if (monto > 0) {
      const { error: errorAhorro } = await supabase.from("savings").insert({
        tenant_id: tenantId,
        job_id: jobId,
        job_item_id: linea.id,
        tipo: "reutilizacion",
        monto,
        descripcion: item.codigo
          ? `Retal ${item.codigo} reutilizado en vez de material nuevo`
          : "Retal reutilizado en vez de material nuevo",
      });
      if (errorAhorro) console.error("[trabajos] No se pudo registrar el ahorro del retal", errorAhorro);
    }
  }

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
  return { error: null, ok: true, marca: Date.now() };
}

// ---------------------------------------------------------------------------
// 2. Piezas que se entregan
// ---------------------------------------------------------------------------

/**
 * Registra una pieza que se entrega al cliente (por ejemplo, el acrílico de
 * 50 × 50). No mueve el inventario: sirve para saber cuánto del material
 * sacado terminó en el trabajo y cuánto se perdió en recortes.
 */
export async function registrarPieza(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const jobId = texto(formData, "job_id");
  const materialId = texto(formData, "material_id");
  const ancho = numero(formData, "ancho_cm");
  const alto = numero(formData, "alto_cm");
  const cantidad = numero(formData, "cantidad") ?? 1;
  const descripcion = texto(formData, "descripcion");

  if (!jobId) return { error: "Falta el trabajo.", ok: false };
  if (!materialId) return { error: "Elige el material de la pieza.", ok: false };
  if (ancho === null || ancho <= 0 || alto === null || alto <= 0) {
    return { error: "Escribe el ancho y el alto de la pieza.", ok: false };
  }
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { error: "La cantidad de piezas debe ser 1 o más.", ok: false };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();
  const foto = await subirFoto(supabase, formData.get("foto"), tenantId, "pieza-");
  if (foto.error) return { error: foto.error, ok: false };

  const { error } = await supabase.from("job_items").insert({
    job_id: jobId,
    material_id: materialId,
    modo: "pieza",
    ancho_cm: ancho,
    alto_cm: alto,
    cantidad,
    descripcion: descripcion || null,
    foto_url: foto.ruta,
  });

  if (error) {
    if (foto.ruta) await supabase.storage.from("sobrantes").remove([foto.ruta]);
    console.error("[trabajos] No se pudo registrar la pieza", error);
    return { error: mensajeError(error), ok: false };
  }

  revalidatePath(`/trabajos/${jobId}`);
  return { error: null, ok: true, marca: Date.now() };
}

// ---------------------------------------------------------------------------
// 3. Devolver sobrante
// ---------------------------------------------------------------------------

/**
 * Lo que sobró de lo sacado vuelve al inventario como un retal nuevo, con su
 * código SOB y ligado al trabajo (cuenta como aprovechado al calcular los
 * recortes).
 */
export async function registrarSobranteDeCorte(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const jobId = texto(formData, "job_id");
  const materialId = texto(formData, "material_id");
  const ancho = numero(formData, "ancho_cm");
  const alto = numero(formData, "alto_cm");

  if (!jobId) return { error: "Falta el trabajo.", ok: false };
  if (!materialId) return { error: "Elige el material del sobrante.", ok: false };
  if (ancho === null || ancho <= 0 || alto === null || alto <= 0) {
    return { error: "Escribe un ancho y un alto mayores que cero.", ok: false };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();

  const { data: material } = await supabase
    .from("materials")
    .select("costo_unitario, color")
    .eq("id", materialId)
    .maybeSingle();

  const { data: numeroCodigo, error: errorCodigo } = await supabase.rpc("siguiente_contador", {
    p_tenant_id: tenantId,
    p_tipo: "sobrante",
  });
  if (errorCodigo || numeroCodigo === null) {
    return {
      error: errorCodigo ? mensajeError(errorCodigo) : "No se pudo generar el código del sobrante.",
      ok: false,
    };
  }

  const foto = await subirFoto(supabase, formData.get("foto"), tenantId, "corte-");
  if (foto.error) return { error: foto.error, ok: false };

  const { error } = await supabase.from("inventory_items").insert({
    tenant_id: tenantId,
    material_id: materialId,
    clase: "retal",
    ancho_cm: ancho,
    alto_cm: alto,
    color: material?.color ?? null,
    foto_url: foto.ruta,
    costo_estimado: material ? Number((areaM2(ancho, alto) * material.costo_unitario).toFixed(2)) : 0,
    job_id: jobId,
    codigo: formatearCodigo("SOB", numeroCodigo),
  });

  if (error) {
    if (foto.ruta) await supabase.storage.from("sobrantes").remove([foto.ruta]);
    console.error("[trabajos] No se pudo devolver el sobrante", error);
    return { error: mensajeError(error), ok: false };
  }

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/inventario");
  return { error: null, ok: true, marca: Date.now() };
}

// ---------------------------------------------------------------------------
// Quitar una línea del trabajo
// ---------------------------------------------------------------------------

/**
 * Quita una salida o una pieza del trabajo. Si era una salida, el material
 * vuelve al inventario (y si era un retal, su ahorro se va con la línea).
 */
export async function eliminarPieza(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const jobId = texto(formData, "job_id");
  if (!id) return;

  const supabase = await createClient();
  const { data: linea } = await supabase
    .from("job_items")
    .select("foto_url, modo, inventory_item_id, cantidad")
    .eq("id", id)
    .maybeSingle();
  if (!linea) return;

  const { data: borradas, error } = await supabase.from("job_items").delete().eq("id", id).select("id");
  if (error || !borradas?.length) {
    if (error) console.error("[trabajos] No se pudo quitar la línea", error);
    return;
  }

  if (linea.modo === "salida" && linea.inventory_item_id) {
    const { error: errorReponer } = await supabase.rpc("reponer_inventario", {
      p_inventory_item_id: linea.inventory_item_id,
      p_cantidad: Number(linea.cantidad),
    });
    if (errorReponer) console.error("[trabajos] No se pudo devolver al inventario", errorReponer);
  }

  if (linea.foto_url) await supabase.storage.from("sobrantes").remove([linea.foto_url]);

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
}

export async function cambiarEstado(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const estadoCrudo = texto(formData, "estado");
  if (!id || !ESTADOS.includes(estadoCrudo as EstadoTrabajo)) return;

  const supabase = await createClient();
  await supabase
    .from("jobs")
    .update({ estado: estadoCrudo as EstadoTrabajo })
    .eq("id", id);

  revalidatePath("/trabajos");
  revalidatePath(`/trabajos/${id}`);
}

/** Borra el trabajo. Lo que había sacado del inventario vuelve al inventario. */
export async function eliminarTrabajo(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!id) return;

  const supabase = await createClient();

  const { data: salidas } = await supabase
    .from("job_items")
    .select("inventory_item_id, cantidad, foto_url")
    .eq("job_id", id);

  const { data: borrado, error } = await supabase.from("jobs").delete().eq("id", id).select("id");
  if (error || !borrado?.length) {
    if (error) console.error("[trabajos] No se pudo borrar el trabajo", error);
    return;
  }

  for (const s of salidas ?? []) {
    if (s.inventory_item_id) {
      await supabase.rpc("reponer_inventario", {
        p_inventory_item_id: s.inventory_item_id,
        p_cantidad: Number(s.cantidad),
      });
    }
  }
  const fotos = (salidas ?? []).map((s) => s.foto_url).filter((f): f is string => Boolean(f));
  if (fotos.length) await supabase.storage.from("sobrantes").remove(fotos);

  revalidatePath("/trabajos");
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// 4. Recortes perdidos
// ---------------------------------------------------------------------------

/**
 * Registra como desperdicio lo que se perdió en recortes, sin medir pedacito
 * por pedacito: por cada material que se corta (m²), lo sacado del inventario
 * menos las piezas entregadas menos los sobrantes devueltos.
 */
export async function cerrarConRecortes(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const jobId = texto(formData, "job_id");
  if (!jobId) return { error: "Falta el trabajo.", ok: false };

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();

  const [{ data: lineas }, { data: devueltos }] = await Promise.all([
    supabase
      .from("job_items")
      .select("material_id, ancho_cm, alto_cm, cantidad, modo")
      .eq("job_id", jobId),
    supabase
      .from("inventory_items")
      .select("material_id, ancho_cm, alto_cm")
      .eq("job_id", jobId)
      .eq("clase", "retal"),
  ]);

  const materialIds = [...new Set((lineas ?? []).map((l) => l.material_id))];
  const { data: materiales } = materialIds.length
    ? await supabase.from("materials").select("id, costo_unitario, unidad").in("id", materialIds)
    : { data: [] };
  const precio = new Map((materiales ?? []).map((m) => [m.id, m]));

  // Por material cortable: lo sacado y lo aprovechado (piezas + devueltos).
  const porMaterial = new Map<string, { sacado: number; aprovechado: number }>();
  for (const l of lineas ?? []) {
    if (!esPorArea(precio.get(l.material_id)?.unidad)) continue;
    const area = areaM2(l.ancho_cm, l.alto_cm) * Number(l.cantidad);
    const acc = porMaterial.get(l.material_id) ?? { sacado: 0, aprovechado: 0 };
    if (l.modo === "salida") acc.sacado += area;
    else acc.aprovechado += area;
    porMaterial.set(l.material_id, acc);
  }
  for (const d of devueltos ?? []) {
    const acc = porMaterial.get(d.material_id);
    // Sólo se resta de un material que de verdad salió en este trabajo.
    if (acc) acc.aprovechado += areaM2(d.ancho_cm, d.alto_cm);
  }

  const registros = [...porMaterial]
    .filter(([, { sacado, aprovechado }]) => sacado - aprovechado > 0.001)
    .map(([materialId, { sacado, aprovechado }]) => {
      const perdido = sacado - aprovechado;
      return {
        tenant_id: tenantId,
        material_id: materialId,
        job_id: jobId,
        cantidad: Number(perdido.toFixed(4)),
        costo: Number((perdido * (precio.get(materialId)?.costo_unitario ?? 0)).toFixed(2)),
        motivo: `Recortes del trabajo: se sacaron ${sacado.toFixed(2)} m² y se aprovecharon ${aprovechado.toFixed(2)} m²`,
        origen: "recortes" as const,
      };
    });

  if (!registros.length) {
    return {
      error:
        "No hay recortes que calcular: saca primero el material del inventario y registra las piezas que entregas.",
      ok: false,
    };
  }

  // Recalcular sin duplicar: se reemplazan sólo los recortes calculados.
  await supabase.from("waste_logs").delete().eq("job_id", jobId).eq("origen", "recortes");

  const { error } = await supabase.from("waste_logs").insert(registros);
  if (error) {
    console.error("[trabajos] No se pudieron registrar los recortes", error);
    return { error: mensajeError(error), ok: false };
  }

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/desperdicio");
  revalidatePath("/dashboard");
  return { error: null, ok: true, marca: Date.now() };
}
