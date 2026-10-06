import Link from "next/link";
import type { Metadata } from "next";

import { eliminarTrabajo } from "./actions";
import { FormularioTrabajo } from "./formulario-trabajo";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
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
import { hoyEnColombia } from "@/lib/capacidad/tipos";
import { formatearFecha } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { estadoEntrega } from "@/lib/trabajos";
import type { EstadoTrabajo } from "@/types/database";
import { ListaBuscable } from "@/components/ui/lista-buscable";

export const metadata: Metadata = { title: "Trabajos · ECO-SIGN" };

const ETIQUETA_ESTADO: Record<EstadoTrabajo, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  terminado: "Terminado",
};

const VARIANTE_ESTADO: Record<EstadoTrabajo, "default" | "secondary" | "outline"> = {
  pendiente: "outline",
  en_proceso: "default",
  terminado: "secondary",
};

export default async function TrabajosPage({
  searchParams,
}: {
  searchParams: Promise<{ origen_sobrante?: string }>;
}) {
  const { origen_sobrante: origenSobranteId } = await searchParams;
  const supabase = await createClient();
  const { data: trabajos, error } = await supabase
    .from("jobs")
    .select("*")
    .order("fecha", { ascending: false });

  // Se traen las piezas de todos los trabajos de una vez y se cuentan aquí, en
  // lugar de lanzar una consulta por fila.
  const { data: piezas } = await supabase.from("job_items").select("job_id");

  const piezasPorTrabajo = new Map<string, number>();
  for (const pieza of piezas ?? []) {
    if (!pieza.job_id) continue;
    piezasPorTrabajo.set(pieza.job_id, (piezasPorTrabajo.get(pieza.job_id) ?? 0) + 1);
  }

  // Se llegó desde Inventario con "Usar en un trabajo": se muestra el código
  // elegido y se propaga hacia el trabajo que se abra o cree, para que
  // [id]/page.tsx pueda precargarlo como origen del corte.
  const sobranteOrigen = origenSobranteId
    ? (
        await supabase
          .from("inventory_items")
          .select("codigo, clase")
          .eq("id", origenSobranteId)
          .maybeSingle()
      ).data
    : null;

  const hoy = hoyEnColombia();

  const sufijoOrigen = origenSobranteId
    ? `?origen_sobrante=${origenSobranteId}`
    : "";

  return (
    <>
      <EncabezadoPagina
        titulo="Trabajos"
        descripcion="Registra cada trabajo y compara lo que debía consumir con lo que consumió."
      />

      {sobranteOrigen ? (
        <div className="mb-6 rounded-md border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Vas a usar{" "}
          {sobranteOrigen.codigo ? (
            <>
              el retal <strong className="font-mono">{sobranteOrigen.codigo}</strong>
            </>
          ) : (
            "material del inventario"
          )}
          . Abre o crea el trabajo donde lo vas a usar: quedará elegido en «Sacar del inventario».
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <ListaBuscable placeholder="Buscar trabajo o cliente…">
        <Card>
          <CardContent className="p-0">
            {error ? (
              <p className="p-6 text-sm text-destructive">
                No se pudieron cargar los trabajos: {error.message}
              </p>
            ) : !trabajos?.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                Todavía no hay trabajos registrados. Crea el primero y luego
                ábrelo desde esta lista para sacar material del inventario.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Recibido</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right" />
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trabajos.map((trabajo) => (
                    <TableRow key={trabajo.id}>
                      <TableCell className="font-medium">
                        {/* Subrayado permanente: en móvil no hay hover que
                            revele que la fila lleva a algún sitio. */}
                        <Link
                          href={`/trabajos/${trabajo.id}${sufijoOrigen}`}
                          className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground"
                        >
                          {trabajo.nombre}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {trabajo.cliente ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatearFecha(trabajo.fecha)}
                      </TableCell>
                      <TableCell>
                        <FechaEntrega fecha={trabajo.fecha_entrega} estado={trabajo.estado} hoy={hoy} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE_ESTADO[trabajo.estado]}>
                          {ETIQUETA_ESTADO[trabajo.estado] ?? trabajo.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Botón explícito: el enlace del nombre por sí solo no
                            deja claro dónde se añaden las piezas. */}
                        <Button
                          variant={piezasPorTrabajo.get(trabajo.id) ? "ghost" : "outline"}
                          size="sm"
                          render={
                            <Link href={`/trabajos/${trabajo.id}${sufijoOrigen}`} />
                          }
                        >
                          {piezasPorTrabajo.get(trabajo.id) ? "Abrir" : "Empezar"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <form action={eliminarTrabajo}>
                          <input type="hidden" name="id" value={trabajo.id} />
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
        </ListaBuscable>

        <FormularioTrabajo />
      </div>
    </>
  );
}

/** Fecha de entrega: rojo si está atrasado, amarillo si es hoy o mañana. */
function FechaEntrega({ fecha, estado, hoy }: { fecha: string | null; estado: EstadoTrabajo; hoy: string }) {
  const situacion = estadoEntrega(fecha, estado, hoy);
  if (situacion === "sin_fecha") return <span className="text-muted-foreground">—</span>;
  if (situacion === "atrasado") {
    return (
      <span className="font-semibold text-destructive">
        {formatearFecha(fecha)}
        <span className="block text-xs font-medium">Atrasado</span>
      </span>
    );
  }
  if (situacion === "pronto") {
    return (
      <span className="font-medium text-amber-700">
        {formatearFecha(fecha)}
        <span className="block text-xs">{fecha === hoy ? "Se entrega hoy" : "Se entrega mañana"}</span>
      </span>
    );
  }
  return <span className="text-muted-foreground">{formatearFecha(fecha)}</span>;
}
