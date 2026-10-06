import type { Metadata } from "next";

import { responderSolicitud } from "../actions";
import { DialogoCobro } from "@/components/capacidad/dialogo-cobro";
import { EstrellasFijas } from "@/components/capacidad/reputacion";
import { TarjetaSolicitud } from "@/components/capacidad/tarjeta-solicitud";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { nombresTalleres } from "@/lib/capacidad/consultas";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";
import { CLASE_DESPLAZABLE_TARJETAS } from "@/components/ui/cuadro-desplazable";
import { ListaBuscable } from "@/components/ui/lista-buscable";

export const metadata: Metadata = { title: "Solicitudes recibidas · ECO-SIGN" };

export default async function SolicitudesRecibidasPage() {
  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);

  const { data } = tenantId
    ? await supabase
        .from("machine_requests")
        .select("*")
        .eq("tenant_propietario", tenantId)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: null };

  // Las pendientes primero: son las que piden una respuesta.
  const solicitudes = [...(data ?? [])].sort(
    (a, b) => Number(b.estado === "pendiente") - Number(a.estado === "pendiente"),
  );

  const idsMaquinas = [...new Set(solicitudes.map((s) => s.machine_id))];
  const [{ data: maquinas }, talleres] = await Promise.all([
    idsMaquinas.length
      ? supabase.from("machines").select("id, nombre").in("id", idsMaquinas)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    nombresTalleres(
      supabase,
      solicitudes.map((s) => s.tenant_solicitante),
    ),
  ]);
  const nombreMaquina = new Map((maquinas ?? []).map((m) => [m.id, m.nombre]));

  // Calificaciones que me dieron en las solicitudes completadas.
  const idsCompletadas = solicitudes.filter((s) => s.estado === "completada").map((s) => s.id);
  const { data: resenas } = idsCompletadas.length
    ? await supabase.from("machine_reviews").select("request_id, estrellas, comentario").in("request_id", idsCompletadas)
    : { data: [] as { request_id: string; estrellas: number; comentario: string | null }[] };
  const calificacion = new Map((resenas ?? []).map((r) => [r.request_id, r]));

  return (
    <>
      <EncabezadoPagina
        titulo="Solicitudes recibidas"
        descripcion="Talleres que quieren usar tus máquinas. Al aceptar, les llega tu teléfono para coordinar."
      />

      {!solicitudes.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Todavía no te han pedido ninguna máquina.
          </CardContent>
        </Card>
      ) : (
        <ListaBuscable placeholder="Buscar máquina o taller…">
        <div className={`grid gap-4 lg:grid-cols-2 ${CLASE_DESPLAZABLE_TARJETAS}`}>
          {solicitudes.map((s) => (
            <TarjetaSolicitud
              key={s.id}
              solicitud={s}
              nombreMaquina={nombreMaquina.get(s.machine_id) ?? "Máquina"}
              contraparte={{
                id: s.tenant_solicitante,
                nombre: talleres.get(s.tenant_solicitante) ?? "Taller de la red",
              }}
              etiquetaContraparte="Pedida por"
            >
              {s.estado === "pendiente" ? (
                <>
                  <BotonDecision id={s.id} decision="aceptada" etiqueta="Aceptar" principal />
                  <BotonDecision id={s.id} decision="rechazada" etiqueta="Rechazar" />
                </>
              ) : null}
              {s.estado === "aceptada" || s.estado === "completada" ? (
                <DialogoCobro
                  solicitudId={s.id}
                  estado={s.estado}
                  monto={s.monto_cobrado == null ? null : Number(s.monto_cobrado)}
                  nombreTaller={talleres.get(s.tenant_solicitante) ?? "el taller"}
                />
              ) : null}
              {s.estado === "aceptada" ? (
                <span className="text-xs text-muted-foreground">
                  Al completarla, el taller podrá calificarte.
                </span>
              ) : null}
              {s.estado === "completada" ? (
                calificacion.has(s.id) ? (
                  <p className="text-sm">
                    Te calificó: <EstrellasFijas estrellas={calificacion.get(s.id)?.estrellas ?? 0} />
                    {calificacion.get(s.id)?.comentario ? (
                      <span className="block text-muted-foreground">«{calificacion.get(s.id)?.comentario}»</span>
                    ) : null}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground">Aún no te ha calificado.</span>
                )
              ) : null}
            </TarjetaSolicitud>
          ))}
        </div>
        </ListaBuscable>
      )}
    </>
  );
}

function BotonDecision({
  id,
  decision,
  etiqueta,
  principal = false,
}: {
  id: string;
  decision: "aceptada" | "rechazada";
  etiqueta: string;
  principal?: boolean;
}) {
  return (
    <form action={responderSolicitud}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" size="sm" variant={principal ? "default" : "outline"}>
        {etiqueta}
      </Button>
    </form>
  );
}
