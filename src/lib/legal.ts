import { CORREO_SOPORTE, WHATSAPP_SOPORTE_VISIBLE } from "@/lib/soporte";

/**
 * Datos del responsable del tratamiento y versión vigente de los textos legales.
 *
 * Al cambiar los Términos o la Política, sube la VERSION: queda guardada en la
 * cuenta de cada persona al aceptar (metadata `acepto_terminos_version`), como
 * constancia de qué texto aceptó (Ley 1581 de 2012).
 */
export const RESPONSABLE = {
  nombre: "Juan Carlos Patiño Ruiz",
  documento: "cédula de ciudadanía 71.714.067 de Medellín",
  domicilio: "Medellín, Colombia",
  correo: CORREO_SOPORTE,
  whatsapp: WHATSAPP_SOPORTE_VISIBLE,
} as const;

export const VERSION_TERMINOS = "1.0";
export const FECHA_VIGENCIA = "3 de octubre de 2026";
