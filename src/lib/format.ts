/** Formato de moneda y medidas en pesos colombianos. */

const FORMATO_COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatearMoneda(valor: number | null | undefined): string {
  return FORMATO_COP.format(valor ?? 0);
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
});

export function formatearNumero(valor: number | null | undefined): string {
  return FORMATO_NUMERO.format(valor ?? 0);
}

export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  // Las fechas date de Postgres llegan como YYYY-MM-DD; parsearlas con new Date
  // las trataría como UTC y en Colombia (UTC-5) mostraría el día anterior.
  const [anio, mes, dia] = fecha.slice(0, 10).split("-").map(Number);
  if (!anio || !mes || !dia) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(anio, mes - 1, dia));
}

/** Centímetros a metros cuadrados, la unidad en la que se cotiza el material. */
export function areaM2(anchoCm: number, altoCm: number): number {
  return (anchoCm * altoCm) / 10_000;
}

/**
 * Momento (timestamptz) en hora de Colombia, para mostrar al usuario.
 * Devuelve "—" si no hay valor. Con `conHora` añade la hora.
 */
export function formatearMomento(
  iso: string | null | undefined,
  conHora = false,
): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(fecha);
}

/** "juan.perez@gmail.com" → "j***@gmail.com": se reconoce sin exponerlo entero. */
export function ocultarCorreo(correo: string): string {
  const arroba = correo.lastIndexOf("@");
  if (arroba < 1) return "***";
  return `${correo[0]}***${correo.slice(arroba)}`;
}
