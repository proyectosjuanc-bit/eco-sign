/**
 * Estados que las Server Actions devuelven a los formularios.
 *
 * Viven fuera de los archivos "use server" porque esos solo pueden exportar
 * funciones async: una constante exportada ahí rompe el build.
 */

/** Resultado de un formulario del panel. */
export interface EstadoForm {
  error: string | null;
  ok: boolean;
  /** Cambia en cada envío correcto para remontar el formulario limpio. */
  marca?: number;
}

export const ESTADO_FORM_INICIAL: EstadoForm = { error: null, ok: false };

/** Resultado de los formularios de autenticación. */
export interface EstadoAuth {
  error: string | null;
  /** Aviso de éxito, por ejemplo cuando falta confirmar el correo. */
  mensaje?: string | null;
}

export const ESTADO_AUTH_INICIAL: EstadoAuth = { error: null, mensaje: null };

/** Un fallo puntual dentro de una importación por archivo, con su motivo. */
export interface FilaFallida {
  fila: number;
  motivo: string;
}

/** Resultado de una importación masiva por archivo (ej. materiales por CSV). */
export interface EstadoImportacion {
  error: string | null;
  creadas: number;
  fallidas: FilaFallida[];
  /** Cambia en cada envío para remontar el formulario limpio. */
  marca?: number;
}

export const ESTADO_IMPORTACION_INICIAL: EstadoImportacion = {
  error: null,
  creadas: 0,
  fallidas: [],
};
