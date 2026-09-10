import type { Metadata } from "next";

import { eliminarDesperdicio } from "./actions";
import { FormularioDesperdicio } from "./formulario-desperdicio";
import type { OpcionMaterial } from "../inventario/formulario-sobrante";
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
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Desperdicio · ECO-SIGN" };

export default async function DesperdicioPage() {
  const supabase = await createClient();

  const [{ data: registros }, { data: materiales }] = await Promise.all([
    supabase.from("waste_logs").select("*"),
    supabase.from("materials").select("id, tipo, color").order("tipo"),
  ]);

  const porMaterial = new Map((materiales ?? []).map((m) => [m.id, m]));
  const costoTotal = (registros ?? []).reduce(
    (total, registro) => total + (registro.costo ?? 0),
    0,
  );

  const opciones: OpcionMaterial[] = (materiales ?? []).map((material) => ({
    id: material.id,
    etiqueta: material.color
      ? `${material.tipo} · ${material.color}`
      : material.tipo,
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Desperdicio"
        descripcion="El costo de lo que se pierde, medido para poder reducirlo."
      >
        <div className="rounded-lg border bg-card px-4 py-2 text-right">
          <p className="text-xs text-muted-foreground">Costo acumulado</p>
          <p className="text-lg font-bold text-destructive">
            {formatearMoneda(costoTotal)}
          </p>
        </div>
      </EncabezadoPagina>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-0">
            {!registros?.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                Todavía no hay desperdicio registrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Medidas</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((registro) => (
                    <TableRow key={registro.id}>
                      <TableCell className="font-medium">
                        <span className="flex flex-col">
                          <span>
                            {registro.material_id
                              ? (porMaterial.get(registro.material_id)?.tipo ?? "—")
                              : "—"}
                          </span>
                          {registro.origen === "recortes" ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              Calculado al cerrar el trabajo
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {registro.ancho_cm && registro.alto_cm
                          ? `${formatearNumero(registro.ancho_cm)} × ${formatearNumero(registro.alto_cm)} cm`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatearNumero(registro.cantidad)} m²
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground">
                        {registro.motivo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {formatearMoneda(registro.costo)}
                      </TableCell>
                      <TableCell>
                        <form action={eliminarDesperdicio}>
                          <input type="hidden" name="id" value={registro.id} />
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
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <FormularioDesperdicio materiales={opciones} />
      </div>
    </>
  );
}
