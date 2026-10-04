import type { Metadata } from "next";
import Link from "next/link";

import { cancelarSolicitud } from "../actions";
import { DialogoCalificar } from "@/components/capacidad/dialogo-calificar";
import { TarjetaSolicitud } from "@/components/capacidad/tarjeta-solicitud";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { nombresTalleres } from "@/lib/capacidad/consultas";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";

export const metadata: Metadata = { title: "Solicitudes enviadas · ECO-SIGN" };

export default async function SolicitudesEnviadasPage() {
  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);

  const { data } = tenantId
    ? await supabase
        .from("machine_requests")
        .select("*")
        .eq("tenant_solicitante", tenantId)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: null };
  const solicitudes = data ?? [];

  // La política de machines deja ver una máquina que ya pedí aunque el dueño
  // la haya pausado después, así que el nombre no se pierde.
  const idsMaquinas = [...new Set(solicitudes.map((s) => s.machine_id))];
  const [{ data: maquinas }, talleres] = await Promise.all([
    idsMaquinas.length
      ? supabase.from("machines").select("id, nombre, contacto_telefono").in("id", idsMaquinas)
      : Promise.resolve({
          data: [] as { id: string; nombre: string; contacto_telefono: string }[],
        }),
    nombresTalleres(
      supabase,
      solicitudes.map((s) => s.tenant_propietario),
    ),
  ]);
  const porId = new Map((maquinas ?? []).map((m) => [m.id, m]));

  // Calificaciones que ya di, para no ofrecer calificar dos veces.
  const idsCompletadas = solicitudes.filter((s) => s.estado === "completada").map((s) => s.id);
  const { data: resenas } = idsCompletadas.length
    ? await supabase.from("machine_reviews").select("request_id, estrellas").in("request_id", idsCompletadas)
    : { data: [] as { request_id: string; estrellas: number }[] };
  const calificacion = new Map((resenas ?? []).map((r) => [r.request_id, r.estrellas]));

  return (
    <>
      <EncabezadoPagina
        titulo="Solicitudes enviadas"
        descripcion="Máquinas que pediste a otros talleres y en qué va cada solicitud."
      >
        <Button variant="outline" nativeButton={false} render={<Link href="/capacidad/disponibles" />}>
          Buscar máquinas
        </Button>
      </EncabezadoPagina>

      {!solicitudes.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Todavía no has pedido ninguna máquina. Búscalas en la red de talleres.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {solicitudes.map((s) => {
            const maquina = porId.get(s.machine_id);
            return (
              <TarjetaSolicitud
                key={s.id}
                solicitud={s}
                nombreMaquina={maquina?.nombre ?? "Máquina"}
                contraparte={{
                  id: s.tenant_propietario,
                  nombre: talleres.get(s.tenant_propietario) ?? "Taller de la red",
                }}
                etiquetaContraparte="De"
              >
                {s.estado === "pendiente" ? (
                  <form action={cancelarSolicitud}>
                    <input type="hidden" name="id" value={s.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      Cancelar solicitud
                    </Button>
                  </form>
                ) : null}
                {s.estado === "completada" ? (
                  <DialogoCalificar
                    solicitudId={s.id}
                    nombreTaller={talleres.get(s.tenant_propietario) ?? "el taller"}
                    nombreMaquina={maquina?.nombre ?? "la máquina"}
                    estrellasDadas={calificacion.get(s.id)}
                  />
                ) : null}
                {s.estado === "aceptada" && maquina ? (
                  <p className="text-sm">
                    Coordina con el taller:{" "}
                    <a
                      href={`tel:${maquina.contacto_telefono.replace(/[^\d+]/g, "")}`}
                      className="font-semibold text-emerald-700 underline-offset-4 hover:underline"
                    >
                      {maquina.contacto_telefono}
                    </a>
                  </p>
                ) : null}
              </TarjetaSolicitud>
            );
          })}
        </div>
      )}
    </>
  );
}
