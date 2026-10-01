/**
 * Validación en el servidor de los formularios de Capacidad.
 *
 * El navegador ya pone `required`, `min`, etc., pero eso se salta con un
 * fetch a mano: lo que de verdad protege la base es esto, que corre dentro de
 * las Server Actions. Los CHECK de la migración son la última red.
 *
 * Cada función devuelve `{ datos }` listos para insertar o `{ error }` con un
 * mensaje que se puede mostrar tal cual en el formulario.
 */

import { z } from "zod";

import { numero, texto } from "@/lib/form-data";
import {
  CAMPOS_POR_TIPO,
  DIAS,
  PREFIJO_ESPECIFICACION,
  PREFIJO_HORARIO,
  hoyEnColombia,
  leerFranjas,
} from "./tipos";
import type {
  DisponibilidadHoraria,
  Especificaciones,
  EstadoOperativo,
  TipoMaquina,
  UnidadPrecio,
} from "@/types/database";

type Resultado<T> = { datos: T; error: null } | { datos: null; error: string };

function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos del formulario.";
}

/** Texto opcional: vacío se guarda como null, no como cadena vacía. */
function opcional(max: number, mensaje: string) {
  return z
    .string()
    .trim()
    .max(max, { error: mensaje })
    .transform((valor) => valor || null);
}

/**
 * Limpia texto libre que escribe otro taller y que acabará en la pantalla y
 * el correo del dueño: quita etiquetas HTML y caracteres de control (salvo
 * saltos de línea), y junta saltos de línea repetidos. React y las
 * plantillas de correo ya escapan al mostrar; esto evita además guardar
 * basura invisible o marcado que alguien pegó.
 */
export function sanitizarTextoLibre(valor: string): string {
  return valor
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Máquina
// ---------------------------------------------------------------------------

const TIPOS = Object.keys(CAMPOS_POR_TIPO) as [TipoMaquina, ...TipoMaquina[]];

const esquemaMaquina = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, { error: "Escribe el nombre de la máquina (mínimo 3 caracteres)." })
    .max(120, { error: "El nombre es demasiado largo (máximo 120 caracteres)." }),
  tipo: z.enum(TIPOS, { error: "Elige el tipo de máquina." }),
  descripcion: opcional(2000, "La descripción es demasiado larga (máximo 2000 caracteres)."),
  ciudad: z
    .string()
    .trim()
    .min(2, { error: "Escribe la ciudad donde está la máquina." })
    .max(80, { error: "La ciudad es demasiado larga." }),
  zona: opcional(80, "La zona es demasiado larga."),
  precio: z
    .number({ error: "Escribe el precio como un número." })
    .positive({ error: "El precio debe ser mayor que cero." })
    .max(1_000_000_000, { error: "El precio es demasiado alto." }),
  unidad_precio: z.enum(
    ["minuto", "hora", "metro_lineal", "metro_cuadrado", "pieza"] satisfies UnidadPrecio[],
    { error: "Elige cómo cobras (por hora, por m²…)." },
  ),
  estado_operativo: z.enum(
    ["disponible", "ocupada", "mantenimiento"] satisfies EstadoOperativo[],
    { error: "Elige el estado de la máquina." },
  ),
  contacto_telefono: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{7,20}$/, {
      error: "Escribe un teléfono de contacto válido (solo números, espacios, + o -).",
    }),
});

export type DatosMaquina = z.infer<typeof esquemaMaquina> & {
  especificaciones: Especificaciones;
  disponibilidad_horaria: DisponibilidadHoraria;
};

export function validarMaquina(formData: FormData): Resultado<DatosMaquina> {
  const resultado = esquemaMaquina.safeParse({
    nombre: texto(formData, "nombre"),
    tipo: texto(formData, "tipo"),
    descripcion: texto(formData, "descripcion"),
    ciudad: texto(formData, "ciudad"),
    zona: texto(formData, "zona"),
    // undefined (no null) para que zod diga "escribe el precio como número".
    precio: numero(formData, "precio") ?? undefined,
    unidad_precio: texto(formData, "unidad_precio"),
    estado_operativo: texto(formData, "estado_operativo") || "disponible",
    contacto_telefono: texto(formData, "contacto_telefono"),
  });
  if (!resultado.success) return { datos: null, error: primerError(resultado.error) };

  const especificaciones = leerEspecificaciones(formData, resultado.data.tipo);
  if (especificaciones.error !== null) return especificaciones;

  const horario = leerHorario(formData);
  if (horario.error !== null) return horario;

  return {
    datos: {
      ...resultado.data,
      especificaciones: especificaciones.datos,
      disponibilidad_horaria: horario.datos,
    },
    error: null,
  };
}

/**
 * Sólo se leen los campos del tipo elegido: si alguien cambió de "Láser" a
 * "Plotter" en el formulario, la potencia que había escrito no se guarda.
 */
function leerEspecificaciones(
  formData: FormData,
  tipo: TipoMaquina,
): Resultado<Especificaciones> {
  const especificaciones: Especificaciones = {};

  for (const campo of CAMPOS_POR_TIPO[tipo]) {
    const nombre = `${PREFIJO_ESPECIFICACION}${campo.clave}`;
    const crudo = texto(formData, nombre);
    if (!crudo) continue;

    switch (campo.formato) {
      case "numero": {
        const valor = numero(formData, nombre);
        if (valor === null || valor <= 0 || valor > 1_000_000) {
          return { datos: null, error: `«${campo.etiqueta}» debe ser un número mayor que cero.` };
        }
        especificaciones[campo.clave] = valor;
        break;
      }
      case "lista": {
        const valores = crudo
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        if (valores.length > 20 || valores.some((v) => v.length > 60)) {
          return { datos: null, error: `«${campo.etiqueta}» tiene demasiados valores o alguno muy largo.` };
        }
        especificaciones[campo.clave] = valores;
        break;
      }
      case "texto":
      case "largo": {
        const max = campo.formato === "largo" ? 1000 : 120;
        if (crudo.length > max) {
          return { datos: null, error: `«${campo.etiqueta}» es demasiado largo (máximo ${max} caracteres).` };
        }
        especificaciones[campo.clave] = sanitizarTextoLibre(crudo);
        break;
      }
    }
  }

  return { datos: especificaciones, error: null };
}

function leerHorario(formData: FormData): Resultado<DisponibilidadHoraria> {
  const horario: DisponibilidadHoraria = {};

  for (const dia of DIAS) {
    const crudo = texto(formData, `${PREFIJO_HORARIO}${dia.valor}`);
    if (!crudo) continue;

    const franjas = leerFranjas(crudo);
    if (!franjas || franjas.length > 6) {
      return {
        datos: null,
        error: `Revisa el horario del ${dia.etiqueta.toLowerCase()}: usa el formato 08:00-12:00, separando franjas con coma.`,
      };
    }
    if (franjas.length) horario[dia.valor] = franjas;
  }

  return { datos: horario, error: null };
}

// ---------------------------------------------------------------------------
// Solicitud
// ---------------------------------------------------------------------------

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una solicitud a más de un año vista no es "tiempo muerto", es otra cosa. */
function enUnAnio(hoy: string): string {
  const [anio, mes, dia] = hoy.split("-");
  return `${Number(anio) + 1}-${mes}-${dia}`;
}

const esquemaSolicitud = z
  .object({
    machine_id: z.uuid({ error: "Falta la máquina." }),
    mensaje: z
      .string()
      .transform(sanitizarTextoLibre)
      .pipe(
        z
          .string()
          .min(10, { error: "Cuéntale al taller qué necesitas (mínimo 10 caracteres)." })
          .max(1000, { error: "El mensaje es demasiado largo (máximo 1000 caracteres)." }),
      ),
    fecha_deseada: z.string().regex(FECHA, { error: "Elige la fecha en que la necesitas." }),
    duracion_estimada: z
      .string()
      .transform(sanitizarTextoLibre)
      .pipe(
        z
          .string()
          .min(1, { error: "Escribe cuánto tiempo la necesitas (por ejemplo, 3 horas)." })
          .max(80, { error: "La duración es demasiado larga (máximo 80 caracteres)." }),
      ),
  })
  // Las fechas YYYY-MM-DD se comparan bien como texto.
  .refine((s) => s.fecha_deseada >= hoyEnColombia(), {
    error: "La fecha no puede ser anterior a hoy.",
  })
  .refine((s) => s.fecha_deseada <= enUnAnio(hoyEnColombia()), {
    error: "Elige una fecha dentro del próximo año.",
  });

export type DatosSolicitud = z.infer<typeof esquemaSolicitud>;

export function validarSolicitud(formData: FormData): Resultado<DatosSolicitud> {
  const resultado = esquemaSolicitud.safeParse({
    machine_id: texto(formData, "machine_id"),
    mensaje: texto(formData, "mensaje"),
    fecha_deseada: texto(formData, "fecha_deseada"),
    duracion_estimada: texto(formData, "duracion_estimada"),
  });
  if (!resultado.success) return { datos: null, error: primerError(resultado.error) };
  return { datos: resultado.data, error: null };
}

// ---------------------------------------------------------------------------
// Cambios de estado (botones)
// ---------------------------------------------------------------------------

export const esquemaId = z.uuid();
