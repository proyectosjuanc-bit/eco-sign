"use server";

import { revalidatePath } from "next/cache";

import type { EstadoForm, EstadoImportacion, FilaFallida } from "@/lib/form-state";
import { costoPorM2 } from "@/lib/lamina";
import { createClient } from "@/lib/supabase/server";
import { ERROR_SIN_TENANT, obtenerTenantId } from "@/lib/supabase/tenant";
import { texto, numero } from "@/lib/form-data";
import { parsearCsv, filasComoObjetos } from "@/lib/csv";
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
 * (una fila de CSV), para no tener la misma regla escrita dos veces.
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
  const costo = porM2 ?? datos.costoUnitarioCrudo;

  if (costo === null || costo < 0) {
    return {
      ok: false,
      error:
        "Escribe el tamaño y el precio de la lámina, o el precio por unidad si el material no viene en láminas.",
    };
  }

  const stock = datos.stock ?? 0;
  if (stock < 0) {
    return { ok: false, error: "Las existencias no pueden ser negativas." };
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
      stock_laminas: stock,
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
  const { error } = await supabase
    .from("materials")
    .insert({ tenant_id: tenantId, ...resultado.material });

  if (error) return { error: error.message, ok: false };

  revalidatePath("/materiales");
  return { error: null, ok: true, marca: Date.now() };
}

/** Lee una celda de CSV como número, aceptando coma decimal. Vacío es null. */
function numeroDeCelda(valor: string | undefined): number | null {
  const limpio = (valor ?? "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Carga varios materiales de golpe desde un archivo CSV.
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
    return { error: "Elige un archivo CSV.", creadas: 0, fallidas: [] };
  }

  const contenido = await archivo.text();
  const filas = filasComoObjetos(parsearCsv(contenido));

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
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    // +2: la fila 1 es el encabezado y los números de Excel empiezan en 1.
    const numeroFila = i + 2;

    const resultado = prepararMaterial({
      tipo: fila.tipo ?? "",
      color: fila.color ?? "",
      grosor: numeroDeCelda(fila.grosor_mm),
      unidadCruda: fila.unidad ?? "",
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

    const { error } = await supabase
      .from("materials")
      .insert({ tenant_id: tenantId, ...resultado.material });

    if (error) {
      fallidas.push({ fila: numeroFila, motivo: error.message });
      continue;
    }

    creadas++;
  }

  if (creadas > 0) revalidatePath("/materiales");

  return { error: null, creadas, fallidas, marca: Date.now() };
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
