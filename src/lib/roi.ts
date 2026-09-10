/**
 * Cálculo del ROI Circular, la métrica que sostiene la promesa comercial de
 * ECO-SIGN: "Tu desperdicio paga el software."
 */

/** Suscripción mensual fija del MVP1, en pesos colombianos. */
export const SUSCRIPCION_MENSUAL = 149_000;

export interface ResumenRoi {
  /** Suma de los ahorros del mes en curso. */
  ahorroMes: number;
  suscripcion: number;
  /** Lo que le queda al cliente después de pagar el software. */
  beneficioAdicional: number;
  /** Cuántas veces el ahorro cubre la suscripción. */
  roiCircular: number;
  /** true cuando el ahorro ya cubre la suscripción. */
  seAutofinancia: boolean;
}

export function calcularRoi(
  ahorroMes: number,
  suscripcion: number = SUSCRIPCION_MENSUAL,
): ResumenRoi {
  const beneficioAdicional = ahorroMes - suscripcion;
  // Sin suscripción no hay ratio que calcular; se devuelve 0 en vez de Infinity.
  const roiCircular = suscripcion > 0 ? ahorroMes / suscripcion : 0;

  return {
    ahorroMes,
    suscripcion,
    beneficioAdicional,
    roiCircular,
    seAutofinancia: beneficioAdicional >= 0,
  };
}

/** Primer y último día del mes en curso, en formato YYYY-MM-DD. */
export function rangoMesActual(hoy: Date = new Date()) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return { inicio: aFechaIso(inicio), fin: aFechaIso(fin) };
}

/** Fecha local a YYYY-MM-DD, sin pasar por UTC. */
export function aFechaIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function etiquetaMes(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", { month: "short" }).format(fecha);
}
