/**
 * Catálogos de la sección Capacidad, compartidos por los formularios (cliente)
 * y la validación de las Server Actions (servidor).
 *
 * Vivir en un solo sitio es lo que garantiza que el formulario pida
 * exactamente los campos que el servidor acepta: SpecFields pinta los campos
 * de `CAMPOS_POR_TIPO` y `esquemas.ts` valida contra la misma lista.
 */

import type {
  DiaSemana,
  DisponibilidadHoraria,
  EstadoOperativo,
  EstadoPublicacion,
  EstadoSolicitud,
  TipoMaquina,
  UnidadPrecio,
} from "@/types/database";

export const TIPOS_MAQUINA: { valor: TipoMaquina; etiqueta: string }[] = [
  { valor: "impresora_gran_formato", etiqueta: "Impresora gran formato" },
  { valor: "laser_corte", etiqueta: "Láser de corte" },
  { valor: "plotter_corte", etiqueta: "Plotter de corte" },
  { valor: "impresora_3d", etiqueta: "Impresora 3D" },
  { valor: "router_cnc", etiqueta: "Router CNC" },
  { valor: "otra", etiqueta: "Otra" },
];

export const UNIDADES_PRECIO: { valor: UnidadPrecio; etiqueta: string; corta: string }[] = [
  { valor: "hora", etiqueta: "Por hora", corta: "hora" },
  { valor: "minuto", etiqueta: "Por minuto", corta: "min" },
  { valor: "metro_cuadrado", etiqueta: "Por metro cuadrado", corta: "m²" },
  { valor: "metro_lineal", etiqueta: "Por metro lineal", corta: "m lineal" },
  { valor: "pieza", etiqueta: "Por pieza", corta: "pieza" },
];

export const ESTADOS_OPERATIVOS: { valor: EstadoOperativo; etiqueta: string }[] = [
  { valor: "disponible", etiqueta: "Disponible" },
  { valor: "ocupada", etiqueta: "Ocupada" },
  { valor: "mantenimiento", etiqueta: "En mantenimiento" },
];

export const ETIQUETA_PUBLICACION: Record<EstadoPublicacion, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  pausada: "Pausada",
};

export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  completada: "Completada",
};

export function etiquetaTipo(tipo: TipoMaquina): string {
  return TIPOS_MAQUINA.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

export function etiquetaEstadoOperativo(estado: EstadoOperativo): string {
  return ESTADOS_OPERATIVOS.find((e) => e.valor === estado)?.etiqueta ?? estado;
}

export function unidadCorta(unidad: UnidadPrecio): string {
  return UNIDADES_PRECIO.find((u) => u.valor === unidad)?.corta ?? unidad;
}

// ---------------------------------------------------------------------------
// Especificaciones por tipo de máquina
// ---------------------------------------------------------------------------

/**
 * Cómo se escribe y se guarda cada campo:
 * - numero · un número (acepta coma decimal).
 * - texto  · texto corto libre ("1200 dpi", "130 × 90").
 * - lista  · varios valores separados por coma; se guarda como array.
 * - largo  · texto de varias líneas.
 */
export type FormatoCampo = "numero" | "texto" | "lista" | "largo";

export interface CampoEspecificacion {
  clave: string;
  etiqueta: string;
  formato: FormatoCampo;
  placeholder?: string;
}

export const CAMPOS_POR_TIPO: Record<TipoMaquina, CampoEspecificacion[]> = {
  impresora_gran_formato: [
    { clave: "ancho_max_cm", etiqueta: "Ancho máximo (cm)", formato: "numero", placeholder: "160" },
    { clave: "tintas", etiqueta: "Tintas", formato: "texto", placeholder: "Látex" },
    {
      clave: "sustratos_soportados",
      etiqueta: "Sustratos soportados",
      formato: "lista",
      placeholder: "Vinilo, lona, papel fotográfico",
    },
    { clave: "resolucion", etiqueta: "Resolución", formato: "texto", placeholder: "1200 dpi" },
  ],
  laser_corte: [
    { clave: "area_corte_cm", etiqueta: "Área de corte (cm)", formato: "texto", placeholder: "130 × 90" },
    { clave: "potencia_w", etiqueta: "Potencia (W)", formato: "numero", placeholder: "100" },
    {
      clave: "materiales_soportados",
      etiqueta: "Materiales soportados",
      formato: "lista",
      placeholder: "Acrílico, MDF, cartón",
    },
  ],
  plotter_corte: [
    { clave: "ancho_max_cm", etiqueta: "Ancho máximo (cm)", formato: "numero", placeholder: "120" },
    {
      clave: "materiales_soportados",
      etiqueta: "Materiales soportados",
      formato: "lista",
      placeholder: "Vinilo, papel transfer",
    },
  ],
  impresora_3d: [
    { clave: "volumen_cm", etiqueta: "Volumen de impresión (cm)", formato: "texto", placeholder: "25 × 21 × 21" },
    { clave: "materiales", etiqueta: "Materiales", formato: "lista", placeholder: "PLA, PETG, ABS" },
    { clave: "resolucion_capa", etiqueta: "Resolución de capa", formato: "texto", placeholder: "0,1 mm" },
  ],
  router_cnc: [
    { clave: "area_trabajo_cm", etiqueta: "Área de trabajo (cm)", formato: "texto", placeholder: "122 × 244" },
    { clave: "ejes", etiqueta: "Ejes", formato: "numero", placeholder: "3" },
    { clave: "materiales", etiqueta: "Materiales", formato: "lista", placeholder: "MDF, madera, aluminio" },
  ],
  otra: [
    {
      clave: "descripcion_libre",
      etiqueta: "Características",
      formato: "largo",
      placeholder: "Qué hace, tamaño máximo, materiales…",
    },
  ],
};

/** Prefijo de los campos de especificación en el FormData, para no chocar con los comunes. */
export const PREFIJO_ESPECIFICACION = "esp_";

/** Texto legible de un valor guardado, para tarjetas y vista previa. */
export function valorEspecificacion(valor: string | number | string[]): string {
  if (Array.isArray(valor)) return valor.join(", ");
  if (typeof valor === "number") return new Intl.NumberFormat("es-CO").format(valor);
  return valor;
}

// ---------------------------------------------------------------------------
// Disponibilidad horaria
// ---------------------------------------------------------------------------

export const DIAS: { valor: DiaSemana; etiqueta: string; corta: string }[] = [
  { valor: "lunes", etiqueta: "Lunes", corta: "Lun" },
  { valor: "martes", etiqueta: "Martes", corta: "Mar" },
  { valor: "miercoles", etiqueta: "Miércoles", corta: "Mié" },
  { valor: "jueves", etiqueta: "Jueves", corta: "Jue" },
  { valor: "viernes", etiqueta: "Viernes", corta: "Vie" },
  { valor: "sabado", etiqueta: "Sábado", corta: "Sáb" },
  { valor: "domingo", etiqueta: "Domingo", corta: "Dom" },
];

export const PREFIJO_HORARIO = "horario_";

/** "08:00-12:00" con horas de 00 a 23 y minutos de 00 a 59. */
const FRANJA = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Lee lo que el usuario escribió para un día ("8:00-12:00, 14:00-18:00") y lo
 * normaliza. Devuelve null si alguna franja no se entiende o termina antes
 * de empezar, para que el servidor pueda decir qué día está mal.
 */
export function leerFranjas(texto: string): string[] | null {
  const partes = texto
    .split(",")
    .map((parte) => parte.replace(/\s+/g, ""))
    .filter(Boolean)
    // Acepta "8:00" escribiendo el cero que falta.
    .map((parte) =>
      parte.replace(/(^|-)(\d):/g, (_, antes: string, hora: string) => `${antes}0${hora}:`),
    );

  for (const parte of partes) {
    const m = FRANJA.exec(parte);
    if (!m) return null;
    const inicio = Number(m[1]) * 60 + Number(m[2]);
    const fin = Number(m[3]) * 60 + Number(m[4]);
    if (fin <= inicio) return null;
  }

  return partes;
}

/** Una línea por día con horario, en orden de lunes a domingo: "Lun 08:00-12:00". */
export function resumenHorario(horario: DisponibilidadHoraria): string[] {
  return DIAS.filter((dia) => horario[dia.valor]?.length).map(
    (dia) => `${dia.corta} ${horario[dia.valor]!.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// Fecha de hoy en Colombia
// ---------------------------------------------------------------------------

/**
 * La aplicación corre en servidores en UTC, pero los talleres están en
 * Colombia (UTC-5): pasadas las 7 p. m. "hoy" en UTC ya es mañana. Todo lo que
 * dependa del día (la fecha mínima de una solicitud, el filtro "disponible
 * hoy") se calcula con la zona horaria de Bogotá.
 */
const ZONA = "America/Bogota";

/** Fecha de hoy en Colombia como YYYY-MM-DD, el formato de un input date. */
export function hoyEnColombia(ahora = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
}

const DIA_POR_INDICE: DiaSemana[] = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

export function diaDeHoyEnColombia(ahora = new Date()): DiaSemana {
  const [anio, mes, dia] = hoyEnColombia(ahora).split("-").map(Number);
  return DIA_POR_INDICE[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
}

/**
 * Disponible hoy = la máquina está operativa y tiene alguna franja para el
 * día de hoy (en Colombia). No mira la hora: una franja de la mañana cuenta
 * todo el día, porque el dueño igual puede acomodar el trabajo.
 */
export function disponibleHoy(
  maquina: { estado_operativo: EstadoOperativo; disponibilidad_horaria: DisponibilidadHoraria },
  ahora = new Date(),
): boolean {
  if (maquina.estado_operativo !== "disponible") return false;
  return Boolean(maquina.disponibilidad_horaria[diaDeHoyEnColombia(ahora)]?.length);
}
