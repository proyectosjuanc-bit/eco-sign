import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ETIQUETA_SOLICITUD, hoyEnColombia } from "@/lib/capacidad/tipos";
import { formatearFecha } from "@/lib/format";
import type { EstadoSolicitud, MachineRequest } from "@/types/database";

const VARIANTE: Record<EstadoSolicitud, "default" | "secondary" | "outline" | "destructive"> = {
  pendiente: "outline",
  aceptada: "default",
  completada: "secondary",
  rechazada: "destructive",
  cancelada: "secondary",
};

/**
 * Una solicitud de máquina, vista desde cualquiera de las dos partes.
 * `contraparte` es el otro taller: quien pide (en Recibidas) o el dueño (en
 * Enviadas). Los botones de cada lado llegan como `children`.
 */
export function TarjetaSolicitud({
  solicitud,
  nombreMaquina,
  contraparte,
  etiquetaContraparte,
  children,
}: {
  solicitud: MachineRequest;
  nombreMaquina: string;
  contraparte: { id: string; nombre: string };
  etiquetaContraparte: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold break-words">{nombreMaquina}</p>
            <p className="text-xs text-muted-foreground">
              {etiquetaContraparte}{" "}
              <Link
                href={`/taller/${contraparte.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {contraparte.nombre}
              </Link>
              {" · "}enviada el {formatearFecha(hoyEnColombia(new Date(solicitud.created_at)))}
            </p>
          </div>
          <Badge
            variant={VARIANTE[solicitud.estado]}
            className={solicitud.estado === "aceptada" ? "bg-emerald-600 text-white" : undefined}
          >
            {ETIQUETA_SOLICITUD[solicitud.estado]}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Fecha deseada</dt>
            <dd>{formatearFecha(solicitud.fecha_deseada)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Duración</dt>
            <dd className="break-words">{solicitud.duracion_estimada}</dd>
          </div>
        </dl>

        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm whitespace-pre-line break-words">
          {solicitud.mensaje}
        </p>

        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
