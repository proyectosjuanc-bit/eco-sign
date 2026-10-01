import type { Metadata } from "next";

import { responderSolicitud } from "../actions";
import { TarjetaSolicitud } from "@/components/capacidad/tarjeta-solicitud";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { nombresTalleres } from "@/lib/capacidad/consultas";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";

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
        <div className="grid gap-4 lg:grid-cols-2">
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
              {s.estado === "aceptada" ? (
                <BotonDecision id={s.id} decision="completada" etiqueta="Marcar como completada" />
              ) : null}
            </TarjetaSolicitud>
          ))}
        </div>
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
  decision: "aceptada" | "rechazada" | "completada";
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
