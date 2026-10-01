"use client";

import Link from "next/link";
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

/**
 * Carga varios materiales de golpe desde la plantilla de Excel.
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
          {/* La genera una ruta del servidor (materiales/plantilla): exceljs
              no tiene por qué viajar al navegador. prefetch={false} para no
              generar el archivo cada vez que se muestra la tarjeta. */}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/materiales/plantilla" prefetch={false} download />}
          >
            Descargar plantilla de Excel
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
          {nombreArchivo ?? "Elige la plantilla de Excel completada"}
        </span>
        <span className="text-xs text-muted-foreground">
          El archivo .xlsx tal cual lo guardaste. También sirve un CSV.
        </span>
        <input
          type="file"
          name="archivo"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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
