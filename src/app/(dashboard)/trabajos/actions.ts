"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { areaM2 } from "@/lib/format";
import { laminasEquivalentes } from "@/lib/lamina";
import { subirFoto } from "@/lib/supabase/subir-foto";
import { texto, numero } from "@/lib/form-data";
import { formatearCodigo } from "@/lib/codigos";
import type { EstadoTrabajo, ModoPieza } from "@/types/database";

const ESTADOS: readonly EstadoTrabajo[] = ["pendiente", "en_proceso", "terminado"];

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

  if (error) return { error: error.message, ok: false };

  revalidatePath("/trabajos");
  return { error: null, ok: true, marca: Date.now() };
}

export async function agregarPieza(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const jobId = texto(formData, "job_id");
  const materialId = texto(formData, "material_id");
  const ancho = numero(formData, "ancho_cm");
  const alto = numero(formData, "alto_cm");
  const descripcion = texto(formData, "descripcion");
  const modo: ModoPieza = texto(formData, "modo") === "lamina" ? "lamina" : "pieza";
  // Una lámina se registra entera: su cantidad es siempre 1.
  const cantidad = modo === "lamina" ? 1 : (numero(formData, "cantidad") ?? 1);
  // Un recorte aprovechable no es la pieza que necesitabas, es lo que sobró
  // alrededor de ella: no tiene sentido guardarlo con cantidad > 1.
  const guardarComoSobrante =
    texto(formData, "guardar_sobrante") === "on" && modo === "pieza" && cantidad === 1;

  if (!jobId) return { error: "Falta el trabajo.", ok: false };
  // A diferencia del resto de tablas, job_items.material_id es NOT NULL: sin
  // material no habría con qué valorar el consumo en pesos.
  if (!materialId) {
    return { error: "Elige el material que se consumió.", ok: false };
  }
  if (ancho === null || ancho <= 0 || alto === null || alto <= 0) {
    return { error: "Escribe medidas mayores que cero.", ok: false };
  }
  if (cantidad < 1) return { error: "La cantidad debe ser al menos 1.", ok: false };

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();

  const foto = await subirFoto(supabase, formData.get("foto"), tenantId, "pieza-");
  if (foto.error) return { error: foto.error, ok: false };

  const { error } = await supabase.from("job_items").insert({
    job_id: jobId,
    material_id: materialId,
    ancho_cm: ancho,
    alto_cm: alto,
    cantidad: Math.round(cantidad),
    modo,
    descripcion: descripcion || null,
    foto_url: foto.ruta,
  });

  if (error) return { error: error.message, ok: false };

  await descontarStock(supabase, materialId, areaM2(ancho, alto) * cantidad);

  // Esta pieza ya cuenta como "aprovechada" en el cálculo de recortes de
  // cerrarConRecortes (va en modo pieza), así que su área no se contará como
  // desperdicio. Aquí además se guarda en Inventario para poder reutilizarla,
  // en vez de que sólo quede anotada como consumo dentro del trabajo.
  //
  // A propósito NO se guarda con job_id: cerrarConRecortes suma aparte los
  // sobrantes de Inventario ligados a este trabajo (los que no pasaron por
  // job_items, como una franja libre registrada directamente en Inventario),
  // y este material ya está contado aquí en job_items. Ponerle job_id lo
  // contaría dos veces como aprovechado.
  if (guardarComoSobrante) {
    const { data: material } = await supabase
      .from("materials")
      .select("costo_unitario, unidad, color")
      .eq("id", materialId)
      .maybeSingle();

    const costoEstimado = material
      ? material.unidad === "m2"
        ? areaM2(ancho, alto) * material.costo_unitario
        : material.costo_unitario
      : null;

    const { data: numeroCodigo } = await supabase.rpc("siguiente_contador", {
      p_tenant_id: tenantId,
      p_tipo: "sobrante",
    });
    // Si el contador falla, se guarda igual: perder el código es preferible a
    // perder el registro del sobrante en sí.
    const codigo = numeroCodigo !== null ? formatearCodigo("SOB", numeroCodigo) : null;

    await supabase.from("inventory_items").insert({
      tenant_id: tenantId,
      material_id: materialId,
      ancho_cm: ancho,
      alto_cm: alto,
      color: material?.color ?? null,
      foto_url: foto.ruta,
      costo_estimado: costoEstimado,
      codigo,
    });

    revalidatePath("/inventario");
  }

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/materiales");
  return { error: null, ok: true, marca: Date.now() };
}

/**
 * Descuenta del stock las láminas que equivalen a un consumo en m².
 *
 * Sólo aplica a materiales con medidas de lámina; el resto se queda igual. El
 * stock no baja de cero, porque consumir más de lo registrado es un descuadre
 * de inventario, no un stock negativo.
 */
async function descontarStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  materialId: string,
  consumoM2: number,
): Promise<void> {
  const { data: material } = await supabase
    .from("materials")
    .select("ancho_cm, alto_cm, costo_lamina, stock_laminas")
    .eq("id", materialId)
    .maybeSingle();

  if (!material) return;

  const laminas = laminasEquivalentes(consumoM2, {
    anchoCm: material.ancho_cm,
    altoCm: material.alto_cm,
    costoLamina: material.costo_lamina,
  });

  // Un valor negativo devuelve láminas al stock, así que sólo se descarta el
  // caso sin efecto.
  if (laminas === 0) return;

  await supabase
    .from("materials")
    .update({ stock_laminas: Math.max(material.stock_laminas - laminas, 0) })
    .eq("id", materialId);
}

export async function eliminarPieza(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const jobId = texto(formData, "job_id");
  if (!id) return;

  const supabase = await createClient();
  const { data: pieza } = await supabase
    .from("job_items")
    .select("foto_url, material_id, ancho_cm, alto_cm, cantidad")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("job_items").delete().eq("id", id);

  // Se devuelve al stock lo que esta pieza había descontado, para que el
  // inventario no quede corto tras corregir un error de registro.
  if (pieza) {
    await descontarStock(
      supabase,
      pieza.material_id,
      -areaM2(pieza.ancho_cm, pieza.alto_cm) * pieza.cantidad,
    );
  }

  // La foto se borra después: si fallara el delete de la fila, no querríamos
  // haber perdido ya la imagen.
  if (pieza?.foto_url) {
    await supabase.storage.from("sobrantes").remove([pieza.foto_url]);
  }

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/materiales");
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

export async function eliminarTrabajo(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  // Las piezas se borran primero por si la FK no tiene ON DELETE CASCADE.
  await supabase.from("job_items").delete().eq("job_id", id);
  await supabase.from("jobs").delete().eq("id", id);
  revalidatePath("/trabajos");
}

/**
 * Cierra el trabajo registrando como desperdicio lo que no se aprovechó.
 *
 * Resuelve el caso de los recortes pequeños: de una lámina salen decenas de
 * pedacitos inservibles que nadie va a medir uno a uno. En vez de eso se resta:
 * el material consumido menos lo que acabó en piezas aprovechadas es lo que se
 * perdió. Se agrupa por material, porque cada uno tiene su precio.
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

  const [{ data: piezas }, { data: sobrantesGuardados }] = await Promise.all([
    supabase
      .from("job_items")
      .select("material_id, ancho_cm, alto_cm, cantidad, modo")
      .eq("job_id", jobId),
    // Sobrantes que se registraron directamente en Inventario y se ligaron a
    // este trabajo (por ejemplo una franja libre, sin pasar por job_items).
    // Los que vienen de la casilla "recorte aprovechable" al añadir una
    // pieza NO tienen job_id (ver agregarPieza) porque ese material ya está
    // contado más abajo en job_items; sumarlos aquí también los duplicaría.
    supabase
      .from("inventory_items")
      .select("material_id, ancho_cm, alto_cm")
      .eq("job_id", jobId),
  ]);

  if (!piezas?.length) {
    return { error: "Este trabajo no tiene piezas registradas.", ok: false };
  }

  // Por material: cuánto se sacó de bodega (láminas) y cuánto acabó en piezas.
  const porMaterial = new Map<string, { consumido: number; aprovechado: number }>();

  for (const pieza of piezas) {
    const area = areaM2(pieza.ancho_cm, pieza.alto_cm) * pieza.cantidad;
    const acumulado = porMaterial.get(pieza.material_id) ?? {
      consumido: 0,
      aprovechado: 0,
    };

    if (pieza.modo === "lamina") {
      acumulado.consumido += area;
    } else {
      acumulado.aprovechado += area;
    }
    porMaterial.set(pieza.material_id, acumulado);
  }

  for (const sobrante of sobrantesGuardados ?? []) {
    if (!sobrante.material_id) continue;
    const area = areaM2(sobrante.ancho_cm, sobrante.alto_cm);
    const acumulado = porMaterial.get(sobrante.material_id);
    // Sin una fila de "consumido" para este material no hay de qué restar:
    // este sobrante no viene de una lámina registrada en este trabajo.
    if (!acumulado) continue;
    acumulado.aprovechado += area;
  }

  const registros: {
    tenant_id: string;
    material_id: string;
    job_id: string;
    cantidad: number;
    costo: number;
    motivo: string;
    origen: "recortes";
  }[] = [];

  for (const [materialId, { consumido, aprovechado }] of porMaterial) {
    // Sin lámina registrada no hay de qué restar: no se sabe cuánto se sacó.
    const sobra = consumido - aprovechado;
    // Se ignoran diferencias despreciables por redondeo de medidas.
    if (sobra <= 0.001) continue;

    const { data: material } = await supabase
      .from("materials")
      .select("costo_unitario")
      .eq("id", materialId)
      .maybeSingle();

    if (!material) continue;

    registros.push({
      tenant_id: tenantId,
      material_id: materialId,
      job_id: jobId,
      cantidad: Number(sobra.toFixed(4)),
      costo: Number((sobra * material.costo_unitario).toFixed(2)),
      motivo: `Recortes no aprovechables: se consumieron ${consumido.toFixed(2)} m² y se usaron ${aprovechado.toFixed(2)} m²`,
      origen: "recortes",
    });
  }

  if (!registros.length) {
    return {
      error:
        "No hay recortes que calcular. Registra la lámina consumida en modo Lámina y las piezas aprovechadas en modo Pieza.",
      ok: false,
    };
  }

  // Se borran los cálculos anteriores de este trabajo para poder recalcular sin
  // duplicar, dejando intactos los registros que escribió una persona.
  await supabase
    .from("waste_logs")
    .delete()
    .eq("job_id", jobId)
    .eq("origen", "recortes");

  const { error } = await supabase.from("waste_logs").insert(registros);
  if (error) return { error: error.message, ok: false };

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/desperdicio");
  revalidatePath("/dashboard");
  return { error: null, ok: true, marca: Date.now() };
}

/**
 * Registra el consumo real y guarda la diferencia como ahorro.
 *
 * El consumo teórico es la suma del área de las piezas. Si lo que de verdad se
 * gastó es menor, esa diferencia valorada en pesos es ahorro por reducción de
 * desperdicio, y alimenta el ROI Circular.
 */
export async function registrarConsumoReal(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const jobId = texto(formData, "job_id");
  const consumoReal = numero(formData, "consumo_real_m2");
  const teorico = numero(formData, "consumo_teorico_m2") ?? 0;
  const costoM2 = numero(formData, "costo_m2") ?? 0;

  if (!jobId) return { error: "Falta el trabajo.", ok: false };
  if (consumoReal === null || consumoReal < 0) {
    return { error: "Escribe el consumo real en m².", ok: false };
  }

  const diferencia = teorico - consumoReal;
  const tenantId = await obtenerTenantId();
  const supabase = await createClient();

  if (tenantId && diferencia > 0 && costoM2 > 0) {
    const monto = diferencia * costoM2;
    await supabase.from("savings").insert({
      tenant_id: tenantId,
      job_id: jobId,
      // Menos consumo del previsto es optimización del corte.
      tipo: "optimizacion",
      monto,
      descripcion: `Consumo real ${consumoReal} m² frente a ${teorico} m² teóricos`,
    });
    revalidatePath("/dashboard");
  }

  revalidatePath(`/trabajos/${jobId}`);
  return { error: null, ok: true, marca: Date.now() };
}
