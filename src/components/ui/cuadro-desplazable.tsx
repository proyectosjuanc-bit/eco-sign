/**
 * Listados largos en un cuadro de altura máxima con su propia barra para
 * deslizar (más bajo en el celular, para poder deslizar también la página por
 * fuera). Un listado corto no muestra barra. Las tablas ya lo traen de serie
 * (`Table`); esto es para los listados de tarjetas o de filas sueltas.
 *
 * El `p-1` evita que el cuadro recorte el borde y la sombra de las tarjetas.
 */
export const CLASE_DESPLAZABLE = "max-h-[55svh] overflow-y-auto md:max-h-[60vh]";
export const CLASE_DESPLAZABLE_TARJETAS = `${CLASE_DESPLAZABLE} p-1`;
