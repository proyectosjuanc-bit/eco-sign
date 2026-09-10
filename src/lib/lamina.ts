import { areaM2 } from "./format";

/**
 * Cálculos de lámina: pasar del precio como lo factura el proveedor —tanto por
 * lámina de tal tamaño— al precio por m², que es la unidad en la que ECO-SIGN
 * valora consumos, sobrantes y desperdicio.
 */

export interface DatosLamina {
  anchoCm: number | null;
  altoCm: number | null;
  costoLamina: number | null;
}

/** Área de una lámina en m², o null si no tiene medidas. */
export function areaLamina(datos: DatosLamina): number | null {
  const { anchoCm, altoCm } = datos;
  if (!anchoCm || !altoCm || anchoCm <= 0 || altoCm <= 0) return null;
  return areaM2(anchoCm, altoCm);
}

/**
 * Precio por m² derivado del precio de una lámina.
 *
 * Devuelve null cuando faltan datos, para que el llamador decida: el formulario
 * pide entonces el precio por m² directamente.
 */
export function costoPorM2(datos: DatosLamina): number | null {
  const area = areaLamina(datos);
  if (area === null || !datos.costoLamina || datos.costoLamina < 0) return null;
  return datos.costoLamina / area;
}

/** Valor de las existencias: lo que costaría reponer las láminas que quedan. */
export function valorStock(
  datos: DatosLamina & { stockLaminas: number },
): number {
  if (!datos.costoLamina || datos.stockLaminas <= 0) return 0;
  return datos.costoLamina * datos.stockLaminas;
}

/**
 * Cuántas láminas equivalen a un consumo en m².
 *
 * Se usa para descontar existencias al registrar consumo, y con un valor
 * negativo para devolverlas cuando se borra una pieza. Devuelve 0 si el
 * material no se mide por lámina.
 */
export function laminasEquivalentes(
  consumoM2: number,
  datos: DatosLamina,
): number {
  const area = areaLamina(datos);
  if (area === null || area <= 0 || consumoM2 === 0) return 0;
  return consumoM2 / area;
}
