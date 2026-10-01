import type { Metadata } from "next";
import Link from "next/link";

import { DialogoSolicitud } from "@/components/capacidad/dialogo-solicitud";
import { TarjetaMaquina } from "@/components/capacidad/tarjeta-maquina";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firmarPortadas, nombresTalleres } from "@/lib/capacidad/consultas";
import { TIPOS_MAQUINA, disponibleHoy } from "@/lib/capacidad/tipos";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";

export const metadata: Metadata = { title: "Red de talleres · ECO-SIGN" };

/** Más que suficiente para la red de hoy; evita traer la tabla entera si crece. */
const LIMITE = 100;

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Filtros = {
  q?: string;
  tipo?: string;
  ciudad?: string;
  min?: string;
  max?: string;
  hoy?: string;
};

/**
 * Lo que se mete dentro de un filtro `or=(...)` de PostgREST no puede llevar
 * comas, paréntesis ni comodines: cambiarían el significado del filtro. Se
 * dejan sólo letras, números y espacios.
 */
function limpiarBusqueda(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function comoPrecio(valor: string | undefined): number | null {
  if (!valor) return null;
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default async function DisponiblesPage({
  searchParams,
}: {
  searchParams: Promise<Filtros>;
}) {
  const filtros = await searchParams;
  const q = limpiarBusqueda(filtros.q ?? "");
  const tipo = TIPOS_MAQUINA.find((t) => t.valor === filtros.tipo)?.valor ?? null;
  const ciudad = (filtros.ciudad ?? "").trim().slice(0, 80);
  const min = comoPrecio(filtros.min);
  const max = comoPrecio(filtros.max);
  const soloHoy = filtros.hoy === "1";

  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);

  // Las mías no salen en la red: no tiene sentido pedírselas a uno mismo.
  // RLS ya limita a publicadas + propias; el .eq de estado quita las propias
  // en borrador y el .neq quita las propias publicadas.
  let consulta = supabase
    .from("machines")
    .select("*")
    .eq("estado_publicacion", "publicada")
    .order("updated_at", { ascending: false })
    .limit(LIMITE);

  if (tenantId) consulta = consulta.neq("tenant_id", tenantId);

  if (tipo) consulta = consulta.eq("tipo", tipo);
  // ilike sin comodines = igual, sin distinguir mayúsculas ("medellín" = "Medellín").
  if (ciudad) consulta = consulta.ilike("ciudad", ciudad.replace(/[%_\\]/g, ""));
  if (min !== null) consulta = consulta.gte("precio", min);
  if (max !== null) consulta = consulta.lte("precio", max);
  if (q) consulta = consulta.or(`nombre.ilike.*${q}*,descripcion.ilike.*${q}*`);

  // Para el selector de ciudad: sólo ciudades donde hay algo publicado.
  let consultaCiudades = supabase
    .from("machines")
    .select("ciudad")
    .eq("estado_publicacion", "publicada")
    .limit(500);
  if (tenantId) consultaCiudades = consultaCiudades.neq("tenant_id", tenantId);

  const [{ data }, { data: filasCiudades }] = await Promise.all([consulta, consultaCiudades]);

  // "Disponible hoy" depende del día en Colombia y de un JSON por días: más
  // claro calcularlo aquí que traducirlo a un filtro de PostgREST.
  const maquinas = (data ?? []).filter((m) => !soloHoy || disponibleHoy(m));

  const [talleres, portadas] = await Promise.all([
    nombresTalleres(
      supabase,
      maquinas.map((m) => m.tenant_id),
    ),
    firmarPortadas(supabase, maquinas),
  ]);

  const ciudades = [
    ...new Map(
      (filasCiudades ?? []).map((f) => [f.ciudad.toLocaleLowerCase("es"), f.ciudad]),
    ).values(),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const hayFiltros = Boolean(q || tipo || ciudad || min !== null || max !== null || soloHoy);

  return (
    <>
      <EncabezadoPagina
        titulo="Red de talleres"
        descripcion="Máquinas que otros talleres ofrecen en sus tiempos muertos. El pago y la entrega se acuerdan directamente con cada taller."
      />

      <Card className="mb-6">
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="q">Buscar</Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Latex, láser CO2…"
                defaultValue={filtros.q ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tipo">Tipo</Label>
              <select id="tipo" name="tipo" defaultValue={tipo ?? ""} className={CLASE_SELECT}>
                <option value="">Todos</option>
                {TIPOS_MAQUINA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ciudad">Ciudad</Label>
              <select id="ciudad" name="ciudad" defaultValue={ciudad} className={CLASE_SELECT}>
                <option value="">Todas</option>
                {ciudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2">
              <div className="grid gap-2">
                <Label htmlFor="min">Precio desde</Label>
                <Input
                  id="min"
                  name="min"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  defaultValue={filtros.min ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max">hasta</Label>
                <Input
                  id="max"
                  name="max"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="100000"
                  defaultValue={filtros.max ?? ""}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
              <input type="checkbox" name="hoy" value="1" defaultChecked={soloHoy} />
              Solo disponibles hoy
            </label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3 lg:justify-end">
              {hayFiltros ? (
                <Button variant="ghost" nativeButton={false} render={<Link href="/capacidad/disponibles" />}>
                  Limpiar
                </Button>
              ) : null}
              <Button type="submit">Filtrar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!maquinas.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {hayFiltros
              ? "Ninguna máquina coincide con estos filtros."
              : "Todavía no hay máquinas publicadas por otros talleres. Cuando alguien publique una, aparecerá aquí."}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {maquinas.length === 1 ? "1 máquina" : `${maquinas.length} máquinas`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {maquinas.map((m) => {
              const nombreTaller = talleres.get(m.tenant_id) ?? "Taller de la red";
              return (
                <TarjetaMaquina
                  key={m.id}
                  maquina={m}
                  taller={{ id: m.tenant_id, nombre: nombreTaller }}
                  fotoUrl={m.fotos[0] ? portadas.get(m.fotos[0]) : null}
                >
                  <DialogoSolicitud
                    machineId={m.id}
                    nombreMaquina={m.nombre}
                    nombreTaller={nombreTaller}
                  />
                </TarjetaMaquina>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
