import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CAMPOS_POR_TIPO,
  disponibleHoy,
  etiquetaEstadoOperativo,
  etiquetaTipo,
  resumenHorario,
  unidadCorta,
  valorEspecificacion,
} from "@/lib/capacidad/tipos";
import { Reputacion } from "@/components/capacidad/reputacion";
import { formatearMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Machine } from "@/types/database";

/** Lo que la tarjeta necesita de una máquina; la vista previa lo arma desde el formulario. */
export type DatosTarjeta = Pick<
  Machine,
  | "nombre"
  | "tipo"
  | "descripcion"
  | "ciudad"
  | "zona"
  | "unidad_precio"
  | "estado_operativo"
  | "especificaciones"
  | "disponibilidad_horaria"
> & {
  precio: number | null;
  /** Reputación de la máquina. Si no viene (vista previa), no se muestra. */
  rating_promedio?: number;
  total_resenas?: number;
};

/**
 * Tarjeta de una máquina, igual a como la ven los demás talleres.
 *
 * Sin estado ni hooks, para poder usarla en las páginas de servidor y
 * también en la vista previa del formulario (componente cliente). Las
 * acciones (solicitar, editar, publicar…) llegan como `children`.
 */
export function TarjetaMaquina({
  maquina,
  taller,
  fotoUrl,
  children,
  className,
}: {
  maquina: DatosTarjeta;
  /** Taller dueño, enlazado a su perfil. Se omite en "mis máquinas". */
  taller?: { id: string; nombre: string } | null;
  fotoUrl?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  const especificaciones = CAMPOS_POR_TIPO[maquina.tipo]
    .map((campo) => ({ campo, valor: maquina.especificaciones[campo.clave] }))
    .filter(({ valor }) => valor !== undefined && valor !== "");
  const horario = resumenHorario(maquina.disponibilidad_horaria);
  const hoy = disponibleHoy(maquina);

  return (
    <Card data-buscable className={cn("overflow-hidden", fotoUrl ? "pt-0" : null, className)}>
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          loading="lazy"
          decoding="async"
          src={fotoUrl}
          alt={`Foto de ${maquina.nombre}`}
          className="h-40 w-full object-cover"
        />
      ) : null}

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-700">
              {etiquetaTipo(maquina.tipo)}
            </p>
            <p className="font-semibold break-words">
              {maquina.nombre || "Nombre de la máquina"}
            </p>
            <p className="text-xs text-muted-foreground">
              {taller ? (
                <>
                  <Link
                    href={`/taller/${taller.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {taller.nombre}
                  </Link>
                  {" · "}
                </>
              ) : null}
              {maquina.ciudad || "Ciudad"}
              {maquina.zona ? ` · ${maquina.zona}` : ""}
            </p>
            {maquina.total_resenas !== undefined ? (
              <Reputacion promedio={maquina.rating_promedio} total={maquina.total_resenas} className="mt-1" />
            ) : null}
          </div>
          <EstadoOperativoBadge estado={maquina.estado_operativo} />
        </div>

        <p className="text-sm">
          <strong className="text-lg text-emerald-600">
            {formatearMoneda(maquina.precio)}
          </strong>{" "}
          <span className="text-muted-foreground">
            / {unidadCorta(maquina.unidad_precio)}
          </span>
        </p>

        {maquina.descripcion ? (
          <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
            {maquina.descripcion}
          </p>
        ) : null}

        {especificaciones.length ? (
          <dl className="grid gap-1 text-xs">
            {especificaciones.map(({ campo, valor }) => (
              <div key={campo.clave} className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">{campo.etiqueta}:</dt>
                <dd className="min-w-0 break-words">{valorEspecificacion(valor)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="text-xs">
          <p className="mb-1 flex items-center gap-2 text-muted-foreground">
            Horario
            {hoy ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                Disponible hoy
              </span>
            ) : null}
          </p>
          {horario.length ? (
            <ul className="grid gap-0.5">
              {horario.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">A convenir</p>
          )}
        </div>

        {children ? <div className="mt-auto flex flex-wrap gap-2 pt-1">{children}</div> : null}
      </CardContent>
    </Card>
  );
}

function EstadoOperativoBadge({ estado }: { estado: DatosTarjeta["estado_operativo"] }) {
  return (
    <Badge
      variant={estado === "disponible" ? "default" : estado === "ocupada" ? "secondary" : "outline"}
      className={estado === "disponible" ? "bg-emerald-600 text-white" : undefined}
    >
      {etiquetaEstadoOperativo(estado)}
    </Badge>
  );
}
