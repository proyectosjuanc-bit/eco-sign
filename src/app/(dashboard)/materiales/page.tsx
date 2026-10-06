import { redirect } from "next/navigation";

/**
 * Materiales e Inventario son una sola pestaña desde octubre de 2026: el
 * catálogo de precios y lo que hay en bodega se manejan en Inventario. Esta
 * ruta queda para los enlaces viejos. Los formularios del catálogo siguen en
 * esta carpeta (formulario-material, formulario-importar, botones-material,
 * actions y la plantilla de Excel) y los usa la página de Inventario.
 */
export default function MaterialesPage() {
  redirect("/inventario");
}
