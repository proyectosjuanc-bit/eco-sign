/**
 * Preferencias de pantalla guardadas en cookies (las lee el servidor para
 * pintar la página como la dejó la persona, sin saltos al cargar).
 *
 * Van en un archivo aparte, sin "use client": una constante exportada desde un
 * componente de cliente le llega al servidor como referencia, no como texto.
 */

/** "1" = barra lateral colapsada (sólo íconos). */
export const COOKIE_BARRA = "barra_colapsada";
