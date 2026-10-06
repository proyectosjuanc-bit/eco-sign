import type { EstadoTrabajo } from "@/types/database";

/**
 * Cómo va un trabajo frente a su fecha de entrega. Las fechas son YYYY-MM-DD
 * (se comparan bien como texto) y `hoy` es el día en Colombia.
 *
 *   atrasado  → la fecha ya pasó y no está terminado (rojo)
 *   pronto    → se entrega hoy o mañana y no está terminado (amarillo)
 *   a_tiempo  → falta más, o ya está terminado
 *   sin_fecha → no se puso fecha de entrega
 */
export type EstadoEntrega = "atrasado" | "pronto" | "a_tiempo" | "sin_fecha";

export function estadoEntrega(
  fechaEntrega: string | null,
  estado: EstadoTrabajo,
  hoy: string,
): EstadoEntrega {
  if (!fechaEntrega) return "sin_fecha";
  if (estado === "terminado") return "a_tiempo";
  if (fechaEntrega < hoy) return "atrasado";
  if (fechaEntrega <= sumarDias(hoy, 1)) return "pronto";
  return "a_tiempo";
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
