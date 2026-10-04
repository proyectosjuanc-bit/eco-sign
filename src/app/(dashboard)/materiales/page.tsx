import type { Metadata } from "next";

import { BotonEliminarMaterial, BotonRestaurarMaterial } from "./botones-material";
import { FormularioMaterial } from "./formulario-material";
import { FormularioImportar } from "./formulario-importar";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearMoneda, formatearNumero } from "@/lib/format";
import { areaLamina } from "@/lib/lamina";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Materiales · ECO-SIGN" };

const ETIQUETA_UNIDAD: Record<string, string> = {
  m2: "m²",
  unidad: "unidad",
  metro_lineal: "metro lineal",
};

/** Catálogo de materiales del tenant: listado y alta. */
export default async function MaterialesPage() {
  const supabase = await createClient();
  const { data: todos, error } = await supabase
    .from("materials")
    .select("*")
    .order("tipo");

  // Los archivados no se ofrecen al registrar, pero se listan aparte para
  // poder restaurarlos.
  const materiales = (todos ?? []).filter((m) => !m.archivado);
  const archivados = (todos ?? []).filter((m) => m.archivado);

  return (
    <>
      <EncabezadoPagina
        titulo="Materiales"
        descripcion="El catálogo de precios. Lo que tienes en bodega se registra en Inventario."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardContent className="p-0">
            {error ? (
              <p className="p-6 text-sm text-destructive">
                No se pudieron cargar los materiales: {error.message}
              </p>
            ) : !materiales.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                Todavía no hay materiales. Crea el primero en el formulario.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Lámina</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materiales.map((material) => {
                    const datos = {
                      anchoCm: material.ancho_cm,
                      altoCm: material.alto_cm,
                      costoLamina: material.costo_lamina,
                    };
                    const area = areaLamina(datos);
                    return (
                    <TableRow key={material.id}>
                      <TableCell className="font-medium">
                        <span className="flex flex-col">
                          <span>{material.tipo}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {[
                              material.color,
                              material.grosor_mm
                                ? `${formatearNumero(material.grosor_mm)} mm`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {area !== null ? (
                          <span className="flex flex-col">
                            <span>
                              {formatearNumero(material.ancho_cm ?? 0)} ×{" "}
                              {formatearNumero(material.alto_cm ?? 0)} cm
                            </span>
                            <span className="text-xs">
                              {formatearNumero(area)} m²
                              {material.costo_lamina
                                ? ` · ${formatearMoneda(material.costo_lamina)}`
                                : ""}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatearMoneda(material.costo_unitario)}
                        <span className="text-muted-foreground">
                          {" "}
                          / {ETIQUETA_UNIDAD[material.unidad] ?? material.unidad}
                        </span>
                      </TableCell>
                      <TableCell>
                        <BotonEliminarMaterial
                          id={material.id}
                          nombre={material.color ? `${material.tipo} · ${material.color}` : material.tipo}
                        />
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {archivados.length ? (
          <Card>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Archivados ({archivados.length})
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  No aparecen al registrar sobrantes, piezas ni desperdicio, pero
                  su historial y sus costos se conservan.
                </p>
                <ul className="mt-3 flex flex-col divide-y">
                  {archivados.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        {m.tipo}
                        {m.color ? <span className="text-muted-foreground"> · {m.color}</span> : null}
                      </span>
                      <BotonRestaurarMaterial id={m.id} />
                    </li>
                  ))}
                </ul>
              </details>
            </CardContent>
          </Card>
        ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <FormularioMaterial />
          <FormularioImportar />
        </div>
      </div>
    </>
  );
}
