"use client";

import { useActionState, useState } from "react";

import { importarMateriales } from "./actions";
import { ESTADO_IMPORTACION_INICIAL } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ENCABEZADOS = [
  "tipo",
  "color",
  "unidad",
  "ancho_cm",
  "alto_cm",
  "costo_lamina",
  "costo_unitario",
  "stock_laminas",
  "grosor_mm",
] as const;

// Dos filas de ejemplo: una lámina (Acrílico, se deriva el precio por m²) y
// un material por unidad (Luces LED, precio directo). Mismas columnas que
// pide el alta manual, para que no diverja de esa estructura.
const FILAS_EJEMPLO = [
  ["Acrílico", "Blanco", "m2", "120", "180", "250000", "", "5", "3"],
  ["Luces LED", "", "unidad", "", "", "", "3500", "100", ""],
];

function generarPlantillaCsv(): string {
  const filas = [ENCABEZADOS.join(","), ...FILAS_EJEMPLO.map((f) => f.join(","))];
  // BOM al inicio, para que Excel detecte UTF-8 al abrir el archivo directo.
  return "﻿" + filas.join("\r\n") + "\r\n";
}

function descargarPlantilla() {
  const blob = new Blob([generarPlantillaCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "materiales-plantilla.csv";
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

/**
 * Carga varios materiales de golpe desde un CSV.
 *
 * Se suma al alta manual (`FormularioMaterial`), no la reemplaza: para dar
 * de alta un material suelto se sigue usando ese formulario; esto es para
 * cuando hay que cargar muchos de una vez, por ejemplo al arrancar con el
 * sistema o tras una compra grande a un proveedor nuevo.
 */
export function FormularioImportar() {
  const [estado, accion, enviando] = useActionState(
    importarMateriales,
    ESTADO_IMPORTACION_INICIAL,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargar varios materiales</CardTitle>
        <CardDescription>
          Para dar de alta muchos de una vez, en vez de uno por uno.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <Button type="button" variant="outline" onClick={descargarPlantilla}>
            Descargar plantilla CSV
          </Button>

          {/* Se remonta con una key nueva tras cada envío: así el campo de
              archivo queda limpio para reintentar, sin usar un ref (el
              linter de hooks no permite tocar refs durante el render). */}
          <CamposImportar
            key={estado.marca ?? "inicial"}
            accion={accion}
            enviando={enviando}
          />

          {estado.error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {estado.error}
            </p>
          ) : null}

          {estado.marca ? (
            <div aria-live="polite" className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-emerald-700">
                {estado.creadas === 1
                  ? "Se creó 1 material."
                  : `Se crearon ${estado.creadas} materiales.`}
              </p>
              {estado.fallidas.length ? (
                <div className="mt-2">
                  <p className="font-medium text-destructive">
                    {estado.fallidas.length === 1
                      ? "1 fila falló:"
                      : `${estado.fallidas.length} filas fallaron:`}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {estado.fallidas.map((f) => (
                      <li key={f.fila}>
                        Fila {f.fila}: {f.motivo}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Corrige esas filas en el archivo y vuelve a subirlo: lo
                    que ya se creó no se duplica al reintentar sólo lo que
                    falló.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function CamposImportar({
  accion,
  enviando,
}: {
  accion: (formData: FormData) => void;
  enviando: boolean;
}) {
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);

  return (
    <form action={accion} className="flex flex-col gap-3">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed p-4 text-center text-sm hover:bg-muted">
        <span className="font-medium">
          {nombreArchivo ?? "Elige el archivo CSV completado"}
        </span>
        <span className="text-xs text-muted-foreground">
          Mismas columnas que la plantilla, exportado desde Excel como CSV
        </span>
        <input
          type="file"
          name="archivo"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(evento) =>
            setNombreArchivo(evento.target.files?.[0]?.name ?? null)
          }
        />
      </label>

      <Button type="submit" disabled={enviando || !nombreArchivo}>
        {enviando ? "Importando…" : "Importar materiales"}
      </Button>
    </form>
  );
}
