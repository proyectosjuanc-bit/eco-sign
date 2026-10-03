/**
 * Canales de soporte de ECO-SIGN.
 *
 * Viven en un solo sitio para poder cambiarlos sin buscar por toda la app (por
 * ejemplo, cuando exista un buzón soporte@reutilizando.online).
 */

/** WhatsApp de soporte en formato internacional, sin "+" ni espacios (Colombia: 57). */
export const WHATSAPP_SOPORTE = "573217542131";

/** Cómo se muestra el número a las personas. */
export const WHATSAPP_SOPORTE_VISIBLE = "321 754 2131";

/** Correo de soporte. Provisional hasta tener un buzón en el dominio propio. */
export const CORREO_SOPORTE = "proyectosjuanc@gmail.com";

/** Enlace que abre WhatsApp con el mensaje ya escrito. */
export function enlaceWhatsApp(
  mensaje = "Hola, tengo una duda con ECO-SIGN sobre…",
): string {
  return `https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(mensaje)}`;
}
