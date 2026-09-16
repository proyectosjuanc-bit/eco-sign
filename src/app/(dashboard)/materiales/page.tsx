import type { Metadata } from "next";

import { ajustarStock, eliminarMaterial } from "./actions";
import { FormularioMaterial } from "./formulario-material";
import { FormularioImportar } from "./formulario-importar";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Button } from "@/components/ui/button";
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
import { areaLamina, valorStock } from "@/lib/lamina";
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
  const { data: materiales, error } = await supabase
    .from("materials")
    .select("*")
    .order("tipo");

  return (
    <>
      <EncabezadoPagina
        titulo="Materiales"
        descripcion="El catálogo con el que se valoran sobrantes, trabajos y desperdicio."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-0">
            {error ? (
              <p className="p-6 text-sm text-destructive">
                No se pudieron cargar los materiales: {error.message}
              </p>
            ) : !materiales?.length ? (
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
                    <TableHead className="text-right">Existencias</TableHead>
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
                    const valor = valorStock({
                      ...datos,
                      stockLaminas: material.stock_laminas,
                    });
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
                      <TableCell className="text-right">
                        {area !== null ? (
                          <span className="flex flex-col items-end">
                            <ControlStock
                              id={material.id}
                              stock={material.stock_laminas}
                            />
                            {valor > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {formatearMoneda(valor)}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Server Action directa: borra sin JavaScript en cliente. */}
                        <form action={eliminarMaterial}>
                          <input type="hidden" name="id" value={material.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            Eliminar
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <FormularioMaterial />
          <FormularioImportar />
        </div>
      </div>
    </>
  );
}

/**
 * Existencias con botones para sumar o restar una lámina.
 *
 * Son Server Actions directas, así que funcionan sin JavaScript en el cliente:
 * útil en el taller, donde la conexión no siempre acompaña.
 */
function ControlStock({ id, stock }: { id: string; stock: number }) {
  return (
    <span className="flex items-center gap-1">
      <BotonAjuste id={id} delta={-1} etiqueta="Restar una lámina" simbolo="−" />
      <span className="min-w-8 text-center font-medium tabular-nums">
        {formatearNumero(stock)}
      </span>
      <BotonAjuste id={id} delta={1} etiqueta="Sumar una lámina" simbolo="+" />
    </span>
  );
}

function BotonAjuste({
  id,
  delta,
  etiqueta,
  simbolo,
}: {
  id: string;
  delta: number;
  etiqueta: string;
  simbolo: string;
}) {
  return (
    <form action={ajustarStock}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="delta" value={delta} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        aria-label={etiqueta}
        title={etiqueta}
        className="size-7 p-0"
      >
        {simbolo}
      </Button>
    </form>
  );
}
