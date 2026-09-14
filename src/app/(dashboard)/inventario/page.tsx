import type { Metadata } from "next";

import Link from "next/link";

import { eliminarSobrante, marcarUsado } from "./actions";
import { DialogoVender } from "./dialogo-vender";
import { FormularioSobrante, type OpcionMaterial } from "./formulario-sobrante";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { areaM2, formatearMoneda, formatearNumero } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { firmarFotos } from "@/lib/supabase/subir-foto";

export const metadata: Metadata = { title: "Inventario · ECO-SIGN" };

export default async function InventarioPage() {
  const supabase = await createClient();

  const [{ data: sobrantes }, { data: materiales }, { data: trabajos }] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("*")
        .order("usado")
        .order("costo_estimado", { ascending: false }),
      supabase.from("materials").select("id, tipo, color").order("tipo"),
      // Los más recientes: si un taller acumula cientos de trabajos, no hace
      // falta que todos quepan en el selector.
      supabase
        .from("jobs")
        .select("id, nombre")
        .order("fecha", { ascending: false })
        .limit(30),
    ]);

  const firmas = await firmarFotos(
    supabase,
    (sobrantes ?? []).map((item) => item.foto_url),
  );

  const opciones: OpcionMaterial[] = (materiales ?? []).map((material) => ({
    id: material.id,
    etiqueta: material.color
      ? `${material.tipo} · ${material.color}`
      : material.tipo,
  }));

  const disponibles = (sobrantes ?? []).filter((item) => !item.usado);
  const valorDisponible = disponibles.reduce(
    (total, item) => total + (item.costo_estimado ?? 0),
    0,
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario de sobrantes"
        descripcion="Cada retal guardado es material que no hay que volver a comprar."
      >
        <div className="rounded-lg border bg-card px-4 py-2 text-right">
          <p className="text-xs text-muted-foreground">Valor disponible</p>
          <p className="text-lg font-bold text-emerald-600">
            {formatearMoneda(valorDisponible)}
          </p>
        </div>
      </EncabezadoPagina>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {!sobrantes?.length ? (
            <Card className="sm:col-span-2 xl:col-span-3">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Todavía no hay sobrantes registrados.
              </CardContent>
            </Card>
          ) : (
            sobrantes.map((item) => {
              const firma = item.foto_url ? firmas.get(item.foto_url) : null;
              return (
                <Card key={item.id} className="overflow-hidden pt-0">
                  {firma ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firma}
                      alt={`Sobrante de ${item.ancho_cm}×${item.alto_cm} cm`}
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center bg-muted text-xs text-muted-foreground">
                      Sin foto
                    </div>
                  )}

                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {item.codigo ? (
                          <p className="font-mono text-xs font-semibold text-emerald-700">
                            {item.codigo}
                          </p>
                        ) : null}
                        <p className="font-semibold">
                          {formatearNumero(item.ancho_cm)} ×{" "}
                          {formatearNumero(item.alto_cm)} cm
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatearNumero(areaM2(item.ancho_cm, item.alto_cm))} m²
                          {item.color ? ` · ${item.color}` : ""}
                        </p>
                      </div>
                      <Badge variant={item.usado ? "secondary" : "default"}>
                        {item.usado ? "Usado" : "Disponible"}
                      </Badge>
                    </div>

                    <p className="text-sm">
                      Valor:{" "}
                      <strong className="text-emerald-600">
                        {formatearMoneda(item.costo_estimado)}
                      </strong>
                    </p>

                    {!item.usado ? (
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="w-full"
                          render={
                            <Link href={`/trabajos?origen_sobrante=${item.id}`} />
                          }
                        >
                          Usar en un trabajo
                        </Button>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            <DialogoVender id={item.id} codigo={item.codigo} />
                            <form action={marcarUsado}>
                              <input type="hidden" name="id" value={item.id} />
                              <Button
                                type="submit"
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground"
                              >
                                Reutilizar
                              </Button>
                            </form>
                          </div>
                          <form action={eliminarSobrante}>
                            <input type="hidden" name="id" value={item.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              Eliminar
                            </Button>
                          </form>
                        </div>
                      </div>
                    ) : (
                      <form action={eliminarSobrante}>
                        <input type="hidden" name="id" value={item.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          Eliminar
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <FormularioSobrante materiales={opciones} trabajos={trabajos ?? []} />
      </div>
    </>
  );
}
