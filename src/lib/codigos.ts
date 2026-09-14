/**
 * Formato de los códigos cortos de inventario ("SOB-014").
 *
 * El número consecutivo en sí lo entrega la función de base de datos
 * `siguiente_contador`, que es atómica; esta función sólo le da forma legible.
 */
export function formatearCodigo(prefijo: string, numero: number, digitos = 3): string {
  return `${prefijo}-${String(numero).padStart(digitos, "0")}`;
}
