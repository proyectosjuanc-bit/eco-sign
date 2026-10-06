/**
 * Interruptores de funciones que se pueden apagar sin borrar su código.
 *
 * Sirven para esconder una parte de la aplicación de forma reversible: el
 * código sigue donde está, compilando y mantenido, pero no se muestra ni se
 * ejecuta. Reactivar es cambiar `false` por `true`.
 */

/**
 * Tomar fotos de sobrantes, piezas y desperdicio, y verlas después en
 * Inventario y en el detalle de cada trabajo.
 *
 * Encendido: la foto sirve de registro visual. Las medidas se siguen
 * escribiendo a mano, y cada sobrante se identifica por su código (`SOB-014`)
 * marcado físicamente sobre el material.
 *
 * Con esto en `false` desaparecen los campos de foto y las fotos ya guardadas
 * (las filas conservan su `foto_url` en la base, no se borra nada).
 */
export const FOTOS_ACTIVAS = true;

/**
 * Medir el sobrante automáticamente a partir de la foto (hoja A4 o regla de
 * referencia junto al retal), con OpenCV.js en el navegador.
 *
 * Apagado a propósito: por ahora la foto es sólo foto, y las medidas se
 * escriben a mano. Con esto en `false` no aparece el panel de medición y
 * OpenCV.js no se descarga nunca, así que el formulario carga igual de rápido.
 *
 * Sólo tiene efecto con `FOTOS_ACTIVAS` en `true`: sin foto no hay qué medir.
 */
export const MEDICION_AUTOMATICA_ACTIVA = false;

/**
 * Tarjetas de ROI en el Dashboard: Suscripción, Beneficio adicional y «ROI
 * Circular» (cuántas veces el ahorro cubre la suscripción).
 *
 * Apagado durante el piloto: los talleres no pagan y ver «Suscripción
 * $149.000» y un beneficio negativo en rojo confunde. El cálculo sigue en
 * `src/lib/roi.ts`; al empezar a cobrar se vuelve a encender.
 */
export const MOSTRAR_ROI = false;

/**
 * «Piezas que entregas» y «Recortes que se pierden» en el detalle del trabajo.
 *
 * Apagado: medir cada pieza (caras, cantos, letras) era confuso y nadie lo iba
 * a hacer. El trabajo queda en dos pasos: sacar del inventario y devolver lo
 * que sobra; lo que se daña se registra en Desperdicio. Las piezas ya
 * anotadas se conservan en la base.
 */
export const PIEZAS_ACTIVAS = false;
