import { areaM2, formatearNumero } from "@/lib/format";
import type { ClaseInventario, Unidad } from "@/types/database";

/**
 * Reglas del inventario único (ver supabase/migrations/20261004_inventario_unico.sql).
 *
 * Todo lo físico vive en inventory_items, en cuatro clases. La clase de una
 * compra la decide cómo se mide el material en el catálogo.
 */

export const ETIQUETA_CLASE: Record<ClaseInventario, string> = {
  lamina: "Láminas completas",
  retal: "Retales",
  metros: "Rollos (metros)",
  unidades: "Unidades",
};

/** Clase en la que entra una compra de un material, según cómo se mide. */
export function claseDeCompra(unidad: Unidad | string): Exclude<ClaseInventario, "retal"> {
  if (unidad === "unidad") return "unidades";
  if (unidad === "metro_lineal") return "metros";
  return "lamina";
}

/** ¿El material se mide por área (m²)? Sólo esos se cortan, dejan retales y recortes. */
export function esPorArea(unidad: Unidad | string | undefined): boolean {
  return unidad === "m2";
}

interface ItemParaValorar {
  clase: ClaseInventario;
  ancho_cm: number;
  alto_cm: number;
  cantidad: number;
  costo_estimado: number | null;
}

interface PrecioMaterial {
  costo_unitario: number;
  costo_lamina: number | null;
}

/** Valor en pesos de un ítem del inventario con los precios actuales. */
export function valorItem(item: ItemParaValorar, material: PrecioMaterial | undefined): number {
  if (item.clase === "retal") {
    if (item.costo_estimado != null) return Number(item.costo_estimado);
    return material ? areaM2(item.ancho_cm, item.alto_cm) * material.costo_unitario : 0;
  }
  if (!material) return 0;
  if (item.clase === "lamina") {
    const porLamina =
      material.costo_lamina ?? areaM2(item.ancho_cm, item.alto_cm) * material.costo_unitario;
    return Number(item.cantidad) * porLamina;
  }
  return Number(item.cantidad) * material.costo_unitario;
}

/** "5 láminas de 120 × 180 cm", "60 × 70 cm", "40 m", "200 unidades". */
export function describirCantidad(item: {
  clase: ClaseInventario;
  ancho_cm: number;
  alto_cm: number;
  cantidad: number;
}): string {
  const n = Number(item.cantidad);
  switch (item.clase) {
    case "lamina":
      return `${formatearNumero(n)} ${n === 1 ? "lámina" : "láminas"} de ${formatearNumero(item.ancho_cm)} × ${formatearNumero(item.alto_cm)} cm`;
    case "retal":
      return `${formatearNumero(item.ancho_cm)} × ${formatearNumero(item.alto_cm)} cm`;
    case "metros":
      return `${formatearNumero(n)} m`;
    case "unidades":
      return `${formatearNumero(n)} ${n === 1 ? "unidad" : "unidades"}`;
  }
}

/** Nombre del material para listas: "Acrílico · Negro · 3 mm". */
export function etiquetaMaterial(m: { tipo: string; color: string | null; grosor_mm?: number | null }): string {
  return [m.tipo, m.color, m.grosor_mm ? `${formatearNumero(m.grosor_mm)} mm` : null]
    .filter(Boolean)
    .join(" · ");
}

/** ¿Un retal alcanza para una pieza de ancho × alto? (en cualquier orientación) */
export function retalAlcanza(
  retal: { ancho_cm: number; alto_cm: number },
  ancho: number,
  alto: number,
): boolean {
  return (
    (retal.ancho_cm >= ancho && retal.alto_cm >= alto) ||
    (retal.ancho_cm >= alto && retal.alto_cm >= ancho)
  );
}
