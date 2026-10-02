"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { calcularConsumoTeorico } from "@/lib/consumo-teorico";
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
  // Si el material salió de un sobrante concreto de Inventario (en vez de
  // stock nuevo de Materiales), ese sobrante se cierra al guardar la pieza.
  const origenInventoryItemId = texto(formData, "origen_inventory_item_id");
  // Sólo aplica cuando el sobrante origen es "por unidad" (tornillos, luces
  // LED…): cuántas de las unidades disponibles se usan en este trabajo. Un
  // sobrante de lámina siempre se usa completo, no tiene este campo. Cuando
  // existe, manda sobre el campo "cantidad" genérico: la cantidad real de la
  // pieza es la que se pidió consumir del sobrante, no un valor aparte.
  const origenSobranteCantidad = numero(formData, "origen_sobrante_cantidad");
  // Una lámina se registra entera: su cantidad es siempre 1. Se redondea de
  // una vez para que el mismo número se use tanto al restar del sobrante
  // origen (RPC) como al insertar la pieza, sin desajustes por decimales.
  const cantidad = Math.round(
    modo === "lamina"
      ? 1
      : (origenSobranteCantidad ?? numero(formData, "cantidad") ?? 1),
  );
  // Un recorte aprovechable no es la pieza que necesitabas, es lo que sobró
  // alrededor de ella: no tiene sentido guardarlo con cantidad > 1. Tampoco
  // aplica si el origen ya es un sobrante (no hay nada nuevo que "sobre" de
  // usar otro sobrante).
  const guardarComoSobrante =
    texto(formData, "guardar_sobrante") === "on" &&
    modo === "pieza" &&
    cantidad === 1 &&
    !origenInventoryItemId;

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

  // Primero se inserta la pieza y DESPUÉS se cierra el sobrante origen: si el
  // insert falla, el sobrante queda intacto y disponible (antes quedaba marcado
  // como usado sin ninguna pieza que lo justificara).
  const { data: piezaCreada, error } = await supabase
    .from("job_items")
    .insert({
      job_id: jobId,
      material_id: materialId,
      ancho_cm: ancho,
      alto_cm: alto,
      cantidad,
      modo,
      descripcion: descripcion || null,
      foto_url: foto.ruta,
    })
    .select("id")
    .single();

  if (error || !piezaCreada) {
    if (foto.ruta) await supabase.storage.from("sobrantes").remove([foto.ruta]);
    return { error: error?.message ?? "No se pudo guardar la pieza.", ok: false };
  }

  if (origenInventoryItemId) {
    // La condición de disponibilidad va dentro de la propia operación (no en un
    // select previo), así que si dos personas usan el mismo sobrante a la vez
    // sólo una lo consigue; a la otra se le deshace la pieza.
    let errorOrigen: string | null = null;

    if (origenSobranteCantidad !== null) {
      // Sobrante "por unidad" (tornillos, luces LED…): se puede usar sólo una
      // parte, ej. 5 de 8. consumir_sobrante_unidad resta de forma atómica en
      // la base y marca usado=true sólo si llega a cero; devuelve null si no
      // había suficiente.
      const { data: cantidadRestante, error: fallo } = await supabase.rpc(
        "consumir_sobrante_unidad",
        {
          p_tenant_id: tenantId,
          p_inventory_item_id: origenInventoryItemId,
          p_cantidad: origenSobranteCantidad,
        },
      );
      if (fallo) errorOrigen = fallo.message;
      else if (cantidadRestante === null) {
        errorOrigen = "No quedan suficientes unidades disponibles de ese sobrante.";
      }
    } else {
      // Sobrante de lámina: se usa completo. Un update que no afecta filas
      // devuelve un array vacío, no un error.
      const { data: filasActualizadas, error: fallo } = await supabase
        .from("inventory_items")
        .update({ usado: true })
        .eq("id", origenInventoryItemId)
        .eq("usado", false)
        .select("id");
      if (fallo) errorOrigen = fallo.message;
      else if (!filasActualizadas?.length) {
        errorOrigen = "Este sobrante ya fue usado o vendido.";
      }
    }

    if (errorOrigen) {
      // Se deshace la pieza para no dejar consumo registrado sin su origen.
      const { error: errorDeshacer } = await supabase
        .from("job_items")
        .delete()
        .eq("id", piezaCreada.id);
      if (errorDeshacer) {
        console.error("[trabajos] No se pudo deshacer la pieza", piezaCreada.id, errorDeshacer);
      } else if (foto.ruta) {
        await supabase.storage.from("sobrantes").remove([foto.ruta]);
      }
      return { error: errorOrigen, ok: false };
    }
  }

  // El stock de materials sólo se descuenta cuando el origen es una lámina
  // NUEVA de stock: un sobrante de inventory_items nunca estuvo ahí, así que
  // no hay nada que restarle. Descontarlo también en ese caso sería un doble
  // descuento del mismo material.
  if (!origenInventoryItemId) {
    await descontarStock(supabase, materialId, areaM2(ancho, alto) * cantidad);
  }

  if (origenInventoryItemId) revalidatePath("/inventario");

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
 * Registra un sobrante que quedó tras cortar del origen elegido en este
 * trabajo (una lámina de stock o un sobrante existente).
 *
 * A diferencia de la casilla "recorte aprovechable" de `agregarPieza` —que
 * NO lleva `job_id` porque ese material ya está contado en `job_items`—,
 * este sobrante SÍ lleva `job_id`: nunca pasa por `job_items`, así que la
 * única forma de que `cerrarConRecortes` sepa que ya no se perdió es
 * encontrarlo ligado al trabajo en `inventory_items`. Son dos caminos
 * deliberadamente distintos; no deben fusionarse sin revisar
 * `cerrarConRecortes`, que suma "aprovechado" de ambas fuentes sin duplicar.
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
  if (!materialId) {
    return { error: "Elige el material del sobrante.", ok: false };
  }
  if (ancho === null || ancho <= 0 || alto === null || alto <= 0) {
    return { error: "Escribe un ancho y un alto mayores que cero.", ok: false };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();

  const foto = await subirFoto(supabase, formData.get("foto"), tenantId, "corte-");
  if (foto.error) return { error: foto.error, ok: false };

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

  const { data: numeroCodigo, error: errorCodigo } = await supabase.rpc(
    "siguiente_contador",
    { p_tenant_id: tenantId, p_tipo: "sobrante" },
  );
  if (errorCodigo || numeroCodigo === null) {
    return {
      error: "No se pudo generar el código del sobrante. Intenta de nuevo.",
      ok: false,
    };
  }
  const codigo = formatearCodigo("SOB", numeroCodigo);

  const { error } = await supabase.from("inventory_items").insert({
    tenant_id: tenantId,
    material_id: materialId,
    ancho_cm: ancho,
    alto_cm: alto,
    color: material?.color ?? null,
    foto_url: foto.ruta,
    costo_estimado: costoEstimado,
    job_id: jobId,
    codigo,
  });

  if (error) return { error: error.message, ok: false };

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/inventario");
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
  // Lo ÚNICO que viene del cliente es lo que midió la persona. El consumo
  // teórico y el costo por m² se recalculan abajo desde la base: antes llegaban
  // en campos ocultos y se podían alterar para inflar el ahorro.
  const consumoReal = numero(formData, "consumo_real_m2");

  if (!jobId) return { error: "Falta el trabajo.", ok: false };
  if (consumoReal === null || consumoReal < 0) {
    return { error: "Escribe el consumo real en m².", ok: false };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();

  // Con RLS, un trabajo de otro taller devuelve cero piezas.
  const { data: piezas, error: errorPiezas } = await supabase
    .from("job_items")
    .select("material_id, ancho_cm, alto_cm, cantidad")
    .eq("job_id", jobId);
  if (errorPiezas) return { error: errorPiezas.message, ok: false };
  if (!piezas?.length) {
    return { error: "Este trabajo no tiene piezas registradas.", ok: false };
  }

  const materialIds = [...new Set(piezas.map((p) => p.material_id))];
  const { data: materiales, error: errorMateriales } = await supabase
    .from("materials")
    .select("id, costo_unitario, unidad")
    .in("id", materialIds);
  if (errorMateriales) return { error: errorMateriales.message, ok: false };

  const { consumoTeoricoM2, costoM2 } = calcularConsumoTeorico(piezas, materiales ?? []);

  const diferencia = consumoTeoricoM2 - consumoReal;
  const monto = diferencia > 0 && costoM2 > 0 ? Number((diferencia * costoM2).toFixed(2)) : 0;
  const descripcion = `Consumo real ${consumoReal} m² frente a ${Number(consumoTeoricoM2.toFixed(4))} m² teóricos`;

  // A lo sumo un ahorro por trabajo y tipo (restricción UNIQUE(job_id, tipo)):
  // registrar de nuevo corrige el monto en vez de sumar otro.
  const { data: existente, error: errorBusqueda } = await supabase
    .from("savings")
    .select("id")
    .eq("job_id", jobId)
    .eq("tipo", "optimizacion")
    .maybeSingle();
  if (errorBusqueda) return { error: errorBusqueda.message, ok: false };

  if (monto > 0) {
    const errorGuardar = existente
      ? await actualizarAhorro(supabase, existente.id, monto, descripcion)
      : await insertarAhorro(supabase, tenantId, jobId, monto, descripcion);
    if (errorGuardar) return { error: errorGuardar, ok: false };
  } else if (existente) {
    // El consumo corregido ya no deja ahorro: se retira el registro anterior
    // para que el dashboard no siga contando uno que ya no es cierto.
    const { error: errorBorrar } = await supabase
      .from("savings")
      .delete()
      .eq("id", existente.id);
    if (errorBorrar) return { error: errorBorrar.message, ok: false };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/trabajos/${jobId}`);
  return { error: null, ok: true, marca: Date.now() };
}

type ClienteSupabase = Awaited<ReturnType<typeof createClient>>;

/** Actualiza un ahorro existente. Devuelve el mensaje de error, o null si salió bien. */
async function actualizarAhorro(
  supabase: ClienteSupabase,
  id: string,
  monto: number,
  descripcion: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("savings")
    .update({ monto, descripcion })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  // Un update que no toca filas no es un error de Postgres: sin esto el
  // usuario creería que se corrigió el ahorro y no.
  if (!data?.length) return "No se pudo actualizar el ahorro de este trabajo.";
  return null;
}

/**
 * Inserta el ahorro del trabajo. Si dos envíos simultáneos llegan a la vez,
 * el segundo choca con UNIQUE(job_id, tipo) (23505): en ese caso se corrige el
 * que ya creó el primero.
 */
async function insertarAhorro(
  supabase: ClienteSupabase,
  tenantId: string,
  jobId: string,
  monto: number,
  descripcion: string,
): Promise<string | null> {
  const { error } = await supabase.from("savings").insert({
    tenant_id: tenantId,
    job_id: jobId,
    // Menos consumo del previsto es optimización del corte.
    tipo: "optimizacion",
    monto,
    descripcion,
  });
  if (!error) return null;
  if (error.code !== "23505") return error.message;

  const { data: ya } = await supabase
    .from("savings")
    .select("id")
    .eq("job_id", jobId)
    .eq("tipo", "optimizacion")
    .maybeSingle();
  return ya ? actualizarAhorro(supabase, ya.id, monto, descripcion) : error.message;
}
