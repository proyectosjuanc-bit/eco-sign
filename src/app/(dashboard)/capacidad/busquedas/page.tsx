import type { Metadata } from "next";

import { cerrarBusqueda } from "../actions";
import { DialogoAyudar, DialogoPublicarBusqueda } from "@/components/capacidad/dialogos-busqueda";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { etiquetaTipo, hoyEnColombia } from "@/lib/capacidad/tipos";
import { formatearFecha } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";
import type { MachineSearch, MachineSearchResponse } from "@/types/database";
import { CLASE_DESPLAZABLE_TARJETAS } from "@/components/ui/cuadro-desplazable";
import { ListaBuscable } from "@/components/ui/lista-buscable";

export const metadata: Metadata = { title: "Busco máquina · ECO-SIGN" };

/** Celular colombiano (10 dígitos que empiezan por 3) → enlace de WhatsApp. */
function enlaceWhatsApp(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "");
  const local = digitos.startsWith("57") && digitos.length === 12 ? digitos.slice(2) : digitos;
  return /^3\d{9}$/.test(local) ? `https://wa.me/57${local}` : null;
}

function estadoVisible(b: MachineSearch, hoy: string): { texto: string; abierta: boolean } {
  if (b.estado === "resuelta") return { texto: "Resuelta", abierta: false };
  if (b.estado === "cancelada") return { texto: "Cancelada", abierta: false };
  if (b.fecha_deseada < hoy) return { texto: "Venció", abierta: false };
  return { texto: "Abierta", abierta: true };
}

function Detalle({ b }: { b: MachineSearch }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Fecha</dt>
          <dd>{formatearFecha(b.fecha_deseada)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ciudad</dt>
          <dd className="break-words">{b.ciudad}</dd>
        </div>
      </dl>
      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm whitespace-pre-line break-words">
        {b.descripcion}
      </p>
    </>
  );
}

/**
 * «Busco máquina»: un taller pide a toda la red una máquina para un trabajo,
 * aunque nadie la tenga publicada. Arriba, las búsquedas propias con sus
 * respuestas; abajo, las de otros talleres para responder «Yo puedo ayudar».
 */
export default async function BusquedasPage() {
  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);
  const hoy = hoyEnColombia();

  const [{ data: mias }, { data: deOtros }, { data: taller }, { data: maquina }] = tenantId
    ? await Promise.all([
        supabase
          .from("machine_searches")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("machine_searches")
          .select("*")
          .neq("tenant_id", tenantId)
          .eq("estado", "abierta")
          .gte("fecha_deseada", hoy)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("tenants").select("ciudad, telefono").eq("id", tenantId).maybeSingle(),
        // Teléfono sugerido para responder si el taller no tiene uno general.
        supabase.from("machines").select("contacto_telefono").eq("tenant_id", tenantId).limit(1).maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: null }, { data: null }];

  const misBusquedas = (mias ?? []) as MachineSearch[];
  const busquedasRed = (deOtros ?? []) as MachineSearch[];

  // RLS devuelve sólo las respuestas que me tocan: las de mis búsquedas y las mías.
  const ids = [...misBusquedas, ...busquedasRed].map((b) => b.id);
  const { data: respuestasData } = ids.length
    ? await supabase
        .from("machine_search_responses")
        .select("*")
        .in("search_id", ids)
        .order("created_at", { ascending: true })
    : { data: [] as MachineSearchResponse[] };
  const respuestas = (respuestasData ?? []) as MachineSearchResponse[];
  const respuestasDe = (searchId: string) => respuestas.filter((r) => r.search_id === searchId);
  const miRespuesta = (searchId: string) =>
    respuestas.find((r) => r.search_id === searchId && r.tenant_id === tenantId);

  const telefonoSugerido = taller?.telefono ?? maquina?.contacto_telefono ?? "";

  return (
    <>
      <EncabezadoPagina
        titulo="Busco máquina"
        descripcion="¿Necesitas una máquina que no tienes? Pídela a toda la red: les llega un aviso a todos los talleres, aunque no la tengan publicada."
      >
        <DialogoPublicarBusqueda ciudad={taller?.ciudad ?? "Medellín"} />
      </EncabezadoPagina>

      <section className="mb-8 flex flex-col gap-3">
        <h2 className="text-base font-semibold">Mis búsquedas</h2>
        {!misBusquedas.length ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Todavía no has publicado búsquedas. Usa «Publicar búsqueda» cuando
              necesites una máquina para un trabajo.
            </CardContent>
          </Card>
        ) : (
          <ListaBuscable placeholder="Buscar máquina, trabajo o ciudad…">
          <div className={`grid gap-4 lg:grid-cols-2 ${CLASE_DESPLAZABLE_TARJETAS}`}>
            {misBusquedas.map((b) => {
              const estado = estadoVisible(b, hoy);
              const lista = respuestasDe(b.id);
              return (
                <Card key={b.id} data-buscable>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{etiquetaTipo(b.tipo)}</p>
                        <p className="text-xs text-muted-foreground">
                          Publicada el {formatearFecha(hoyEnColombia(new Date(b.created_at)))}
                        </p>
                      </div>
                      <Badge
                        variant={estado.abierta ? "default" : "secondary"}
                        className={estado.abierta ? "bg-emerald-600 text-white" : undefined}
                      >
                        {estado.texto}
                      </Badge>
                    </div>
                    <Detalle b={b} />

                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">
                        {lista.length
                          ? `${lista.length} ${lista.length === 1 ? "taller puede" : "talleres pueden"} ayudarte`
                          : estado.abierta
                            ? "Todavía nadie ha respondido. Te llegará un aviso cuando alguien lo haga."
                            : "Nadie respondió."}
                      </p>
                      {lista.map((r) => {
                        const whatsapp = enlaceWhatsApp(r.telefono);
                        return (
                          <div key={r.id} className="rounded-md border px-3 py-2 text-sm">
                            <p className="font-medium">{r.taller_nombre || "Un taller"}</p>
                            <p className="whitespace-pre-line break-words text-muted-foreground">{r.mensaje}</p>
                            <p className="mt-1 flex flex-wrap gap-3">
                              <a
                                href={`tel:${r.telefono.replace(/[^\d+]/g, "")}`}
                                className="font-semibold text-emerald-700 underline-offset-4 hover:underline"
                              >
                                📞 {r.telefono}
                              </a>
                              {whatsapp ? (
                                <a
                                  href={whatsapp}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-emerald-700 underline-offset-4 hover:underline"
                                >
                                  WhatsApp
                                </a>
                              ) : null}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {estado.abierta ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={cerrarBusqueda}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="estado" value="resuelta" />
                          <Button type="submit" size="sm" variant="outline">
                            ✓ Ya la conseguí
                          </Button>
                        </form>
                        <form action={cerrarBusqueda}>
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="estado" value="cancelada" />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            Ya no la necesito
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          </ListaBuscable>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Búsquedas de otros talleres</h2>
        {!busquedasRed.length ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Ahora no hay talleres buscando máquinas. Cuando alguno publique una
              búsqueda te llegará un aviso.
            </CardContent>
          </Card>
        ) : (
          <ListaBuscable placeholder="Buscar máquina, trabajo o ciudad…">
          <div className={`grid gap-4 lg:grid-cols-2 ${CLASE_DESPLAZABLE_TARJETAS}`}>
            {busquedasRed.map((b) => {
              const mia = miRespuesta(b.id);
              const nombre = b.taller_nombre || "Un taller";
              return (
                <Card key={b.id} data-buscable>
                  <CardContent className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {nombre} busca: {etiquetaTipo(b.tipo)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Publicada el {formatearFecha(hoyEnColombia(new Date(b.created_at)))}
                      </p>
                    </div>
                    <Detalle b={b} />
                    <DialogoAyudar
                      searchId={b.id}
                      nombreTaller={nombre}
                      telefono={telefonoSugerido}
                      respuesta={mia ? { id: mia.id, mensaje: mia.mensaje } : undefined}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
          </ListaBuscable>
        )}
      </section>
    </>
  );
}
