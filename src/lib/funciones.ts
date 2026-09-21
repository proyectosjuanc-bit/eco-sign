/**
 * Interruptores de funciones que se pueden apagar sin borrar su código.
 *
 * Sirven para esconder una parte de la aplicación de forma reversible: el
 * código sigue donde está, compilando y mantenido, pero no se muestra ni se
 * ejecuta. Reactivar es cambiar `false` por `true`.
 */

/**
 * Tomar fotos de sobrantes, piezas y desperdicio, y medir automáticamente con
 * la cámara (hoja A4 o regla de referencia).
 *
 * Apagado a propósito: en el taller las medidas se escriben a mano, y cada
 * sobrante se identifica por su código (`SOB-014`) escrito físicamente sobre
 * el material, que es más fiable que reconocerlo por una foto.
 *
 * Con esto en `false`:
 * - No aparece ningún campo de foto en los formularios.
 * - No aparece el panel de medición automática.
 * - No se muestran las fotos ya guardadas (las filas antiguas conservan su
 *   `foto_url` en la base, no se borra nada).
 * - OpenCV.js no se descarga nunca, así que la aplicación carga más rápido.
 *
 * Para reactivarlo basta con poner `true`: el código de subida, medición y
 * visualización sigue intacto.
 */
export const FOTOS_ACTIVAS = false;
