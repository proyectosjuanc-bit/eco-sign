"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm, EstadoImportacion, FilaFallida } from "@/lib/form-state";
import { admiteDecimales, claseDeCompra } from "@/lib/inventario";
import { costoPorM2 } from "@/lib/lamina";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { texto, numero } from "@/lib/form-data";
import { leerArchivoMateriales, unidadDesdeTexto } from "@/lib/materiales-archivo";
import type { Unidad } from "@/types/database";

const UNIDADES: readonly Unidad[] = ["m2", "unidad", "metro_lineal", "ml"];

interface DatosMaterial {
  tipo: string;
  color: string;
  grosor: number | null;
  unidadCruda: string;
  ancho: number | null;
  alto: number | null;
  costoLamina: number | null;
  costoUnitarioCrudo: number | null;
  /** Líquidos: precio y contenido (ml) del envase, y ml por m² si se sabe. */
  precioEnvase?: number | null;
  contenidoMl?: number | null;
  mlPorM2?: number | null;
}

/**
 * Valida y deriva los campos de un material, sin tocar la base.
 *
 * Comparte la misma regla que el alta manual: con medidas y precio de
 * lámina se deriva el precio por m²; sin ellos se acepta el costo por
 * unidad escrito directo (el caso de un material que no viene en láminas).
 * La usan tanto `crearMaterial` (un FormData) como `importarMateriales`
 * (una fila del archivo de Excel o CSV), para no tener la misma regla escrita dos veces.
 */
type ResultadoMaterial =
  | { ok: true; material: MaterialParaInsertar }
  | { ok: false; error: string };

function prepararMaterial(datos: DatosMaterial): ResultadoMaterial {
  if (!datos.tipo) return { ok: false, error: "El tipo de material es obligatorio." };

  const unidad = UNIDADES.includes(datos.unidadCruda as Unidad)
    ? (datos.unidadCruda as Unidad)
    : "m2";

  const porM2 = costoPorM2({
    anchoCm: datos.ancho,
    altoCm: datos.alto,
    costoLamina: datos.costoLamina,
  });
  // Líquidos: el precio de 1 ml sale del envase (un litro de tinta, un galón
  // de adhesivo…), que es como lo vende el proveedor.
  const porMl =
    unidad === "ml" && datos.precioEnvase != null && datos.contenidoMl
      ? datos.precioEnvase / datos.contenidoMl
      : null;
  if (unidad === "ml" && datos.contenidoMl != null && datos.contenidoMl <= 0) {
    return { ok: false, error: "El contenido del envase debe ser mayor que cero." };
  }
  const costo = unidad === "m2" ? (porM2 ?? datos.costoUnitarioCrudo) : (porMl ?? datos.costoUnitarioCrudo);
  const mlPorM2 = unidad === "ml" ? (datos.mlPorM2 ?? null) : null;
  if (mlPorM2 !== null && (mlPorM2 <= 0 || mlPorM2 > 1000)) {
    return { ok: false, error: "Los ml por m² deben estar entre 0 y 1000." };
  }

  if (costo === null || costo < 0) {
    return {
      ok: false,
      error:
        unidad === "ml"
          ? "Escribe el precio y el contenido (ml) del envase."
          : "Escribe el tamaño y el precio de la lámina, o el precio por unidad si el material no viene en láminas.",
    };
  }

  // Sin cantidades: el catálogo sólo tiene precios. Lo que hay en bodega se
  // registra en Inventario («Entrada de material»).
  return {
    ok: true,
    material: {
      tipo: datos.tipo,
      color: datos.color || null,
      grosor_mm: datos.grosor,
      costo_unitario: costo,
      unidad,
      ancho_cm: unidad === "m2" ? datos.ancho : null,
      alto_cm: unidad === "m2" ? datos.alto : null,
      costo_lamina: unidad === "m2" ? datos.costoLamina : null,
      stock_laminas: 0,
      ml_por_m2: mlPorM2,
    },
  };
}

interface MaterialParaInsertar {
  tipo: string;
  color: string | null;
  grosor_mm: number | null;
  costo_unitario: number;
  unidad: Unidad;
  ancho_cm: number | null;
  alto_cm: number | null;
  costo_lamina: number | null;
  stock_laminas: number;
  ml_por_m2: number | null;
}

export async function crearMaterial(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const resultado = prepararMaterial({
    tipo: texto(formData, "tipo"),
    color: texto(formData, "color"),
    grosor: numero(formData, "grosor_mm"),
    unidadCruda: texto(formData, "unidad"),
    ancho: numero(formData, "ancho_cm"),
    alto: numero(formData, "alto_cm"),
    costoLamina: numero(formData, "costo_lamina"),
    costoUnitarioCrudo: numero(formData, "costo_unitario"),
    precioEnvase: numero(formData, "precio_envase"),
    contenidoMl: numero(formData, "contenido_ml"),
    mlPorM2: numero(formData, "ml_por_m2"),
  });

  if (!resultado.ok) return { error: resultado.error, ok: false };

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, ok: false };

  const supabase = await createClient();
  // tenant_id va explícito: las tablas no tienen default y RLS rechaza el
  // insert si falta.
  const { data: creado, error } = await supabase
    .from("materials")
    .insert({ tenant_id: tenantId, ...resultado.material })
    .select("id")
    .single();

  if (error || !creado) return { error: error?.message ?? "No se pudo crear el material.", ok: false };

  const aviso = await registrarCantidadInicial(
    supabase,
    tenantId,
    creado.id,
    resultado.material,
    numero(formData, "cantidad_inicial"),
  );

  revalidarInventario();
  return aviso
    ? { error: null, ok: true, marca: Date.now(), aviso }
    : { error: null, ok: true, marca: Date.now() };
}

/** Inventario y Materiales viven en la misma pestaña (Inventario). */
function revalidarInventario() {
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
}

/**
 * Lo que ya hay en bodega al crear el material: entra al inventario en el
 * mismo paso (como láminas, metros, unidades o ml, según cómo se mide).
 * Devuelve un aviso si no se pudo; el material queda creado igual.
 */
async function registrarCantidadInicial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  materialId: string,
  material: MaterialParaInsertar,
  cantidad: number | null,
): Promise<string | null> {
  if (cantidad === null || cantidad <= 0) return null;
  const clase = claseDeCompra(material.unidad);
  if (!admiteDecimales(clase) && !Number.isInteger(cantidad)) {
    return "El material se creó, pero la cantidad debe ser entera (1, 2, 3…). Regístrala con «Entrada».";
  }
  if (clase === "lamina" && (!material.ancho_cm || !material.alto_cm)) {
    return "El material se creó, pero sin el tamaño de la lámina no se pueden registrar láminas.";
  }
  const { error } = await supabase.from("inventory_items").insert({
    tenant_id: tenantId,
    material_id: materialId,
    clase,
    ancho_cm: clase === "lamina" ? Number(material.ancho_cm) : 1,
    alto_cm: clase === "lamina" ? Number(material.alto_cm) : 1,
    cantidad,
    costo_estimado: 0,
    codigo: null,
  });
  if (error) {
    console.error("[materiales] No se pudo registrar la cantidad inicial", error);
    return "El material se creó, pero no pudimos registrar lo que tienes. Hazlo con «Entrada».";
  }
  return null;
}

/** Lee una celda de CSV como número, aceptando coma decimal. Vacío es null. */
function numeroDeCelda(valor: string | undefined): number | null {
  const limpio = (valor ?? "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Carga varios materiales de golpe desde la plantilla de Excel (o un CSV).
 *
 * Se suma al alta manual, no la reemplaza: mismas columnas, misma regla de
 * derivar el precio por m² (`prepararMaterial`), fila por fila. Una fila que
 * falla no detiene a las demás — se reporta con su número y motivo, para
 * poder corregir sólo esa línea del archivo y reintentar sin perder lo que
 * ya se creó.
 */
export async function importarMateriales(
  _previo: EstadoImportacion,
  formData: FormData,
): Promise<EstadoImportacion> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elige el archivo de Excel con tus materiales.", creadas: 0, fallidas: [] };
  }

  const lectura = await leerArchivoMateriales(archivo);
  if (lectura.error !== null) return { error: lectura.error, creadas: 0, fallidas: [] };
  const filas = lectura.filas;

  if (!filas.length) {
    return {
      error: "El archivo no tiene filas de datos, sólo encabezado (o está vacío).",
      creadas: 0,
      fallidas: [],
    };
  }

  const tenantId = await obtenerTenantId();
  if (!tenantId) return { error: ERROR_SIN_TENANT, creadas: 0, fallidas: [] };

  const supabase = await createClient();

  let creadas = 0;
  const fallidas: FilaFallida[] = [];

  // Fila por fila, no en lote: así una fila con datos raros no descarta las
  // demás, y el resumen puede decir exactamente cuál falló y por qué.
  for (const { numero: numeroFila, datos: fila } of filas) {
    // La plantilla muestra "Lámina (m²)", "Unidad"…; aquí se pasa al valor interno.
    const unidadFila = unidadDesdeTexto(fila.unidad ?? "");
    const precioFila = numeroDeCelda(fila.costo_unitario);
    const resultado = prepararMaterial({
      tipo: fila.tipo ?? "",
      color: fila.color ?? "",
      grosor: numeroDeCelda(fila.grosor_mm),
      unidadCruda: unidadFila,
      ancho: numeroDeCelda(fila.ancho_cm),
      alto: numeroDeCelda(fila.alto_cm),
      costoLamina: numeroDeCelda(fila.costo_lamina),
      // Para líquidos la plantilla pide el precio de 1 litro.
      costoUnitarioCrudo: unidadFila === "ml" && precioFila !== null ? precioFila / 1000 : precioFila,
    });

    if (!resultado.ok) {
      fallidas.push({ fila: numeroFila, motivo: resultado.error });
      continue;
    }

    const { data: creado, error } = await supabase
      .from("materials")
      .insert({ tenant_id: tenantId, ...resultado.material })
      .select("id")
      .single();

    if (error || !creado) {
      fallidas.push({ fila: numeroFila, motivo: error?.message ?? "No se pudo crear." });
      continue;
    }

    const aviso = await registrarCantidadInicial(
      supabase,
      tenantId,
      creado.id,
      resultado.material,
      numeroDeCelda(fila.cantidad_inicial),
    );
    if (aviso) fallidas.push({ fila: numeroFila, motivo: aviso });

    creadas++;
  }

  if (creadas > 0) revalidarInventario();

  return { error: null, creadas, fallidas, marca: Date.now() };
}

/** Resultado de eliminar o restaurar un material, para el aviso en pantalla. */
export interface ResultadoArchivo {
  ok: boolean;
  /** Qué pasó, en palabras del taller. */
  mensaje: string;
}

const ERROR_MATERIAL = "No pudimos completar la acción. Intenta de nuevo.";

/**
 * Elimina un material. Si ya tiene historial (sobrantes, desperdicio o piezas
 * de trabajos), la base se niega a borrarlo (claves foráneas RESTRICT) y en su
 * lugar se ARCHIVA: deja de ofrecerse al registrar, pero su historial y sus
 * costos se conservan. Así un clic de más nunca borra meses de datos.
 */
export async function eliminarMaterial(id: string): Promise<ResultadoArchivo> {
  if (!id) return { ok: false, mensaje: ERROR_MATERIAL };

  const supabase = await createClient();
  const { data: borrados, error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .select("id");

  if (!error && borrados?.length) {
    revalidarInventario();
    return { ok: true, mensaje: "Material eliminado." };
  }

  // 23503: lo usan sobrantes, desperdicios o piezas. Se archiva.
  if (error?.code === "23503") {
    const { data: archivados, error: errorArchivo } = await supabase
      .from("materials")
      .update({ archivado: true })
      .eq("id", id)
      .select("id");
    if (!errorArchivo && archivados?.length) {
      revalidarInventario();
      return {
        ok: true,
        mensaje:
          "Este material tiene historial, así que se archivó en vez de borrarse. Ya no aparecerá al registrar; puedes restaurarlo desde «Archivados».",
      };
    }
    console.error("[materiales] No se pudo archivar", errorArchivo);
    return { ok: false, mensaje: ERROR_MATERIAL };
  }

  // Sin error y sin filas: no existe o el rol no puede borrar (RLS).
  if (error) console.error("[materiales] No se pudo eliminar", error);
  return { ok: false, mensaje: "No tienes permiso para eliminar materiales, o ya no existe." };
}

/** Devuelve un material archivado a la lista de materiales para registrar. */
export async function restaurarMaterial(id: string): Promise<ResultadoArchivo> {
  if (!id) return { ok: false, mensaje: ERROR_MATERIAL };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .update({ archivado: false })
    .eq("id", id)
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("[materiales] No se pudo restaurar", error);
    return { ok: false, mensaje: "No pudimos restaurar el material." };
  }
  revalidarInventario();
  return { ok: true, mensaje: "Material restaurado." };
}

/**
 * Guarda cuántos ml por m² gasta el taller con un líquido (tinta, adhesivo).
 * Lo usa la calculadora de «Sacar del inventario» para la próxima vez: cada
 * máquina gasta distinto, así que cada taller pone su propio número.
 */
export async function guardarMlPorM2(materialId: string, mlPorM2: number): Promise<{ error: string | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return { error: "Material no válido." };
  if (!Number.isFinite(mlPorM2) || mlPorM2 <= 0 || mlPorM2 > 1000) {
    return { error: "Los ml por m² deben estar entre 0 y 1000." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .update({ ml_por_m2: Math.round(mlPorM2 * 100) / 100 })
    .eq("id", materialId)
    .eq("unidad", "ml")
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[materiales] No se pudo guardar ml por m²", error);
    return { error: "No pudimos guardar el consumo por m². Revisa que tu rol permita editar." };
  }
  revalidarInventario();
  return { error: null };
}
