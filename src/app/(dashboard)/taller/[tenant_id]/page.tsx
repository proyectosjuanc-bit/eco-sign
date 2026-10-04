import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DialogoSolicitud } from "@/components/capacidad/dialogo-solicitud";
import { EstrellasFijas, Reputacion } from "@/components/capacidad/reputacion";
import { TarjetaMaquina } from "@/components/capacidad/tarjeta-maquina";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { firmarPortadas, nombresTalleres } from "@/lib/capacidad/consultas";
import { esquemaId } from "@/lib/capacidad/esquemas";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";

export const metadata: Metadata = { title: "Taller · ECO-SIGN" };

/**
 * Perfil público de un taller dentro de la red.
 *
 * Muestra sólo lo que el propio taller decidió publicar: el nombre, y de sus
 * máquinas publicadas la ciudad y el teléfono. Nada de profiles ni del resto
 * de sus datos. Un taller que no tiene nada publicado ni comparte una
 * solicitud con quien mira no existe para él (404).
 */
export default async function TallerPage({
  params,
}: {
  params: Promise<{ tenant_id: string }>;
}) {
  const { tenant_id: tallerId } = await params;
  if (!esquemaId.safeParse(tallerId).success) notFound();

  const [supabase, miTenant] = await Promise.all([createClient(), obtenerTenantId()]);

  const [nombres, { data }, { data: reputacion }, { data: resenas }] = await Promise.all([
    nombresTalleres(supabase, [tallerId]),
    supabase
      .from("machines")
      .select("*")
      .eq("tenant_id", tallerId)
      .eq("estado_publicacion", "publicada")
      .order("updated_at", { ascending: false }),
    supabase.rpc("reputacion_talleres", { p_ids: [tallerId] }),
    supabase
      .from("machine_reviews")
      .select("id, estrellas, comentario, created_at, tenant_autor, machine_id")
      .eq("tenant_calificado", tallerId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const rep = reputacion?.[0];
  // Nombre de quien calificó, sólo si ese taller es visible para quien mira.
  const autores = await nombresTalleres(supabase, (resenas ?? []).map((r) => r.tenant_autor));

  const nombre = nombres.get(tallerId);
  if (!nombre) notFound();

  const maquinas = data ?? [];
  const portadas = await firmarPortadas(supabase, maquinas);
  const esMiTaller = tallerId === miTenant;

  const ciudades = [...new Set(maquinas.map((m) => (m.zona ? `${m.ciudad} · ${m.zona}` : m.ciudad)))];
  const telefonos = [...new Set(maquinas.map((m) => m.contacto_telefono))];

  return (
    <>
      <EncabezadoPagina
        titulo={nombre}
        descripcion={esMiTaller ? "Así ven tu taller los demás talleres de la red." : "Taller de la red ECO-SIGN"}
      >
        <Button variant="outline" nativeButton={false} render={<Link href="/capacidad/disponibles" />}>
          Volver a la red
        </Button>
      </EncabezadoPagina>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Reputación</p>
          <Reputacion promedio={rep?.promedio} total={rep?.total} className="mt-1 text-sm" />
        </div>
        <Dato etiqueta="Ubicación" valores={ciudades} vacio="Sin máquinas publicadas" />
        <Dato
          etiqueta="Contacto"
          valores={telefonos}
          vacio="—"
          enlace={(t) => `tel:${t.replace(/[^\d+]/g, "")}`}
        />
        <Dato
          etiqueta="Máquinas publicadas"
          valores={[String(maquinas.length)]}
          vacio="0"
        />
      </div>

      {!maquinas.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Este taller no tiene máquinas publicadas ahora mismo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {maquinas.map((m) => (
            <TarjetaMaquina
              key={m.id}
              maquina={m}
              fotoUrl={m.fotos[0] ? portadas.get(m.fotos[0]) : null}
            >
              {esMiTaller ? null : (
                <DialogoSolicitud machineId={m.id} nombreMaquina={m.nombre} nombreTaller={nombre} />
              )}
            </TarjetaMaquina>
          ))}
        </div>
      )}

      {resenas?.length ? (
        <Card className="mt-6">
          <CardContent>
            <h2 className="mb-3 font-semibold">Lo que dicen otros talleres</h2>
            <ul className="flex flex-col divide-y text-sm">
              {resenas.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <EstrellasFijas estrellas={r.estrellas} />
                    <span className="text-xs text-muted-foreground">
                      {autores.get(r.tenant_autor) ?? "Un taller de la red"} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" })}
                    </span>
                  </div>
                  {r.comentario ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{r.comentario}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Dato({
  etiqueta,
  valores,
  vacio,
  enlace,
}: {
  etiqueta: string;
  valores: string[];
  vacio: string;
  enlace?: (valor: string) => string;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      {valores.length ? (
        valores.map((v) => (
          <p key={v} className="font-semibold break-words">
            {enlace ? (
              <a href={enlace(v)} className="text-emerald-700 underline-offset-4 hover:underline">
                {v}
              </a>
            ) : (
              v
            )}
          </p>
        ))
      ) : (
        <p className="font-semibold text-muted-foreground">{vacio}</p>
      )}
    </div>
  );
}
