import type { Metadata } from "next";
import Link from "next/link";

import { cambiarPublicacion, eliminarMaquina } from "./actions";
import { TarjetaMaquina } from "@/components/capacidad/tarjeta-maquina";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { firmarPortadas } from "@/lib/capacidad/consultas";
import { ETIQUETA_PUBLICACION } from "@/lib/capacidad/tipos";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";
import { cn } from "@/lib/utils";
import type { EstadoPublicacion } from "@/types/database";
import { CLASE_DESPLAZABLE_TARJETAS } from "@/components/ui/cuadro-desplazable";
import { ListaBuscable } from "@/components/ui/lista-buscable";

export const metadata: Metadata = { title: "Capacidad · ECO-SIGN" };

const FILTROS: { valor: EstadoPublicacion | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Todas" },
  { valor: "publicada", etiqueta: "Publicadas" },
  { valor: "borrador", etiqueta: "Borradores" },
  { valor: "pausada", etiqueta: "Pausadas" },
];

/** En Next 16 los searchParams llegan como promesa. */
export default async function CapacidadPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro: filtroCrudo } = await searchParams;
  const filtro = FILTROS.find((f) => f.valor === filtroCrudo)?.valor ?? null;

  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);

  // RLS también deja ver las publicadas de otros talleres: aquí sólo las mías.
  const { data } = tenantId
    ? await supabase
        .from("machines")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
    : { data: null };
  const todas = data ?? [];

  const maquinas = filtro ? todas.filter((m) => m.estado_publicacion === filtro) : todas;
  const portadas = await firmarPortadas(supabase, maquinas);

  const cuantas = (valor: EstadoPublicacion | null) =>
    valor ? todas.filter((m) => m.estado_publicacion === valor).length : todas.length;

  return (
    <>
      <EncabezadoPagina
        titulo="Mis máquinas"
        descripcion="Publica tus máquinas para que otros talleres las usen en tus tiempos muertos."
      >
        <Button nativeButton={false} render={<Link href="/capacidad/nueva" />}>Publicar máquina</Button>
      </EncabezadoPagina>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.etiqueta}
            href={f.valor ? `/capacidad?filtro=${f.valor}` : "/capacidad"}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filtro === f.valor
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.etiqueta} <span className="opacity-70">({cuantas(f.valor)})</span>
          </Link>
        ))}
      </div>

      {!maquinas.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {todas.length
              ? "No hay máquinas en este filtro."
              : "Todavía no has publicado ninguna máquina. Si tienes una impresora, láser o router que pasa horas quieto, publícalo y cobra por ese tiempo."}
          </CardContent>
        </Card>
      ) : (
        <ListaBuscable placeholder="Buscar máquina…">
        <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${CLASE_DESPLAZABLE_TARJETAS}`}>
          {maquinas.map((m) => (
            <TarjetaMaquina
              key={m.id}
              maquina={m}
              fotoUrl={m.fotos[0] ? portadas.get(m.fotos[0]) : null}
            >
              <div className="flex w-full items-center justify-between gap-2 text-xs">
                <Badge
                  variant={m.estado_publicacion === "publicada" ? "default" : "secondary"}
                  className={
                    m.estado_publicacion === "publicada" ? "bg-emerald-600 text-white" : undefined
                  }
                >
                  {ETIQUETA_PUBLICACION[m.estado_publicacion]}
                </Badge>
                <span className="text-muted-foreground">
                  {m.total_solicitudes} solicitudes · {m.total_completadas} completadas
                </span>
              </div>

              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/capacidad/${m.id}/editar`} />}
              >
                Editar
              </Button>

              {m.estado_publicacion === "publicada" ? (
                <BotonEstado id={m.id} estado="pausada" etiqueta="Pausar" />
              ) : (
                <BotonEstado
                  id={m.id}
                  estado="publicada"
                  etiqueta={m.estado_publicacion === "pausada" ? "Reanudar" : "Publicar"}
                  principal
                />
              )}

              <form action={eliminarMaquina}>
                <input type="hidden" name="id" value={m.id} />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                >
                  Eliminar
                </Button>
              </form>
            </TarjetaMaquina>
          ))}
        </div>
        </ListaBuscable>
      )}
    </>
  );
}

function BotonEstado({
  id,
  estado,
  etiqueta,
  principal = false,
}: {
  id: string;
  estado: EstadoPublicacion;
  etiqueta: string;
  principal?: boolean;
}) {
  return (
    <form action={cambiarPublicacion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <Button type="submit" size="sm" variant={principal ? "default" : "outline"}>
        {etiqueta}
      </Button>
    </form>
  );
}
