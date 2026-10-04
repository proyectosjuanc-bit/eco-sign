"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm, EstadoImportacion, FilaFallida } from "@/lib/form-state";
import { claseDeCompra } from "@/lib/inventario";
import { costoPorM2 } from "@/lib/lamina";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { texto, numero } from "@/lib/form-data";
import { leerArchivoMateriales, unidadDesdeTexto } from "@/lib/materiales-archivo";
import type { Unidad } from "@/types/database";

const UNIDADES: readonly Unidad[] = ["m2", "unidad", "metro_lineal"];

interface DatosMaterial {
  tipo: string;
  color: string;
  grosor: number | null;
  unidadCruda: string;
  ancho: number | null;
  alto: number | null;
  costoLamina: number | null;
  costoUnitarioCrudo: number | null;
  stock: number | null;
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
  | { ok: true; material: MaterialParaInsertar; cantidadInicial: number }
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
  const costo = porM2 ?? datos.costoUnitarioCrudo;

  if (costo === null || costo < 0) {
    return {
      ok: false,
      error:
        "Escribe el tamaño y el precio de la lámina, o el precio por unidad si el material no viene en láminas.",
    };
  }

  // Lo que ya hay en bodega NO se guarda en el material (el catálogo sólo
  // tiene precios): entra como existencia en el Inventario.
  const stock = datos.stock ?? 0;
  if (stock < 0) {
    return { ok: false, error: "La cantidad que tienes no puede ser negativa." };
  }

  return {
    ok: true,
    material: {
      tipo: datos.tipo,
      color: datos.color || null,
      grosor_mm: datos.grosor,
      costo_unitario: costo,
      unidad,
      ancho_cm: datos.ancho,
      alto_cm: datos.alto,
      costo_lamina: datos.costoLamina,
      stock_laminas: 0,
    },
    cantidadInicial: stock,
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
    stock: numero(formData, "stock_laminas"),
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

  const aviso = await crearExistenciaInicial(supabase, tenantId, creado.id, resultado.material, resultado.cantidadInicial);

  revalidatePath("/materiales");
  revalidatePath("/inventario");
  return aviso
    ? { error: null, ok: true, marca: Date.now(), aviso }
    : { error: null, ok: true, marca: Date.now() };
}

/**
 * Si al crear el material se escribió cuánto hay, eso entra al Inventario como
 * láminas completas, metros o unidades. Devuelve un aviso si no se pudo.
 */
async function crearExistenciaInicial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  materialId: string,
  material: MaterialParaInsertar,
  cantidad: number,
): Promise<string | null> {
  if (cantidad <= 0) return null;
  const clase = claseDeCompra(material.unidad);
  if (clase === "lamina" && (!material.ancho_cm || !material.alto_cm)) {
    return "El material se creó, pero sin el tamaño de la lámina no se pueden registrar láminas en el Inventario.";
  }
  const { error } = await supabase.from("inventory_items").insert({
    tenant_id: tenantId,
    material_id: materialId,
    clase,
    ancho_cm: clase === "lamina" ? Number(material.ancho_cm) : 1,
    alto_cm: clase === "lamina" ? Number(material.alto_cm) : 1,
    cantidad: clase === "metros" ? cantidad : Math.round(cantidad),
    costo_estimado: 0,
    codigo: null,
  });
  if (error) {
    console.error("[materiales] No se pudo registrar la existencia inicial", error);
    return "El material se creó, pero no pudimos registrar lo que tienes en el Inventario. Hazlo con «Entrada de material».";
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
    const resultado = prepararMaterial({
      tipo: fila.tipo ?? "",
      color: fila.color ?? "",
      grosor: numeroDeCelda(fila.grosor_mm),
      // La plantilla muestra "Lámina (m²)", "Unidad"…; aquí se pasa al valor interno.
      unidadCruda: unidadDesdeTexto(fila.unidad ?? ""),
      ancho: numeroDeCelda(fila.ancho_cm),
      alto: numeroDeCelda(fila.alto_cm),
      costoLamina: numeroDeCelda(fila.costo_lamina),
      costoUnitarioCrudo: numeroDeCelda(fila.costo_unitario),
      stock: numeroDeCelda(fila.stock_laminas),
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

    const aviso = await crearExistenciaInicial(supabase, tenantId, creado.id, resultado.material, resultado.cantidadInicial);
    if (aviso) fallidas.push({ fila: numeroFila, motivo: aviso });

    creadas++;
  }

  if (creadas > 0) {
    revalidatePath("/materiales");
    revalidatePath("/inventario");
  }

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
    revalidatePath("/materiales");
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
      revalidatePath("/materiales");
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
  revalidatePath("/materiales");
  return { ok: true, mensaje: "Material restaurado." };
}

