/**
 * Lectura de campos de FormData, compartida por las Server Actions.
 *
 * Estaba duplicada tal cual en inventario/actions.ts, trabajos/actions.ts y
 * materiales/actions.ts; se centraliza aquí para no volver a copiarla en cada
 * Server Action nueva.
 */

export function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/** Acepta coma decimal, como se escribe en español. */
export function numero(formData: FormData, campo: string): number | null {
  const crudo = texto(formData, campo).replace(",", ".");
  if (!crudo) return null;
  const valor = Number(crudo);
  return Number.isFinite(valor) ? valor : null;
}
