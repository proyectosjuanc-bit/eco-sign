import { generarPlantillaExcel } from "@/lib/materiales-archivo";

/**
 * Descarga la plantilla de Excel para cargar materiales en lote.
 *
 * Se genera en el servidor (exceljs no viaja al navegador) y queda bajo
 * /materiales, así que el proxy ya exige sesión para descargarla.
 */

// exceljs necesita APIs de Node, no el runtime edge.
export const runtime = "nodejs";

export async function GET() {
  const contenido = await generarPlantillaExcel();

  return new Response(contenido, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-materiales-eco-sign.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
