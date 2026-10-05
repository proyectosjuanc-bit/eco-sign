import type { Metadata } from "next";

import Link from "next/link";

import { eliminarSobrante, marcarUsado } from "./actions";
import { DialogoVender } from "./dialogo-vender";
import { FormularioSobrante, type OpcionMaterial } from "./formulario-sobrante";
import { CorregirCantidad, FormularioEntrada, type MaterialEntrada } from "./formularios-existencias";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { areaM2, formatearMoneda, formatearNumero } from "@/lib/format";
import { FOTOS_ACTIVAS } from "@/lib/funciones";
import { ETIQUETA_CLASE, admiteDecimales, describirCantidad, etiquetaMaterial, valorItem } from "@/lib/inventario";
import { createClient } from "@/lib/supabase/server";
import { firmarFotos } from "@/lib/supabase/subir-foto";

export const metadata: Metadata = { title: "Inventario · ECO-SIGN" };

/**
 * Sobrantes por página. Antes se mostraban todos (usados y disponibles) con su
 * foto en cada visita: con meses de uso eran cientos de fotos por carga, y ese
 * tráfico es lo primero que agota el plan gratuito de Supabase.
 */
const POR_PAGINA = 24;

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; pagina?: string }>;
}) {
  const { ver, pagina } = await searchParams;
  // Por defecto, los disponibles: es lo que se busca al ir a cortar.
  const verUsados = ver === "usados";
  const paginaActual = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);
  const desde = (paginaActual - 1) * POR_PAGINA;

  const supabase = await createClient();

  const [
    { data: sobrantes, count: totalPestana },
    { data: materiales },
    { data: trabajos },
    { count: totalDisponibles },
    { count: totalUsados },
    { data: valorRpc, error: errorValor },
  ] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("*", { count: "exact" })
        .eq("clase", "retal")
        .eq("usado", verUsados)
        // Disponibles: los más valiosos primero. Usados: los más recientes.
        .order(verUsados ? "created_at" : "costo_estimado", { ascending: false })
        .range(desde, desde + POR_PAGINA - 1),
      supabase
        .from("materials")
        .select("id, tipo, color, grosor_mm, unidad, archivado, ancho_cm, alto_cm, costo_unitario, costo_lamina")
        .order("tipo"),
      // Los más recientes: si un taller acumula cientos de trabajos, no hace
      // falta que todos quepan en el selector.
      supabase
        .from("jobs")
        .select("id, nombre")
        .order("fecha", { ascending: false })
        .limit(30),
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("clase", "retal").eq("usado", false),
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("clase", "retal").eq("usado", true),
      // Sumado en la base: con paginación ya no se tienen todas las filas aquí.
      supabase.rpc("valor_sobrantes_disponibles"),
    ]);

  // Existencias (láminas completas, rollos y unidades): pocas filas, una por
  // material, así que van completas y sin paginar.
  const [{ data: existencias }, { data: valorPorClase }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, clase, material_id, ancho_cm, alto_cm, cantidad, costo_estimado")
      .neq("clase", "retal")
      .eq("usado", false)
      .order("clase"),
    supabase.rpc("valor_inventario"),
  ]);
  const valorInventario = (valorPorClase ?? []).reduce((t, f) => t + Number(f.valor), 0);

  if (errorValor) console.error("[inventario] No se pudo sumar el valor disponible", errorValor);
  const valorDisponible = Number(valorRpc ?? 0);
  const totalPaginas = Math.max(1, Math.ceil((totalPestana ?? 0) / POR_PAGINA));

  /** Enlace a otra pestaña o página, conservando lo demás. */
  const enlace = (cambios: { ver?: "usados" | null; pagina?: number }) => {
    const params = new URLSearchParams();
    const usados = cambios.ver === undefined ? verUsados : cambios.ver === "usados";
    if (usados) params.set("ver", "usados");
    const p = cambios.pagina ?? 1;
    if (p > 1) params.set("pagina", String(p));
    const q = params.toString();
    return q ? `/inventario?${q}` : "/inventario";
  };

  // Firmar cuesta una llamada a Storage por lote; sin fotos que mostrar no
  // tiene sentido pedirlas.
  const firmas = FOTOS_ACTIVAS
    ? await firmarFotos(supabase, (sobrantes ?? []).map((item) => item.foto_url))
    : new Map<string, string>();

  const porMaterial = new Map((materiales ?? []).map((m) => [m.id, m]));

  // Los archivados siguen sirviendo para nombrar y valorar el historial, pero
  // no se ofrecen para registrar nada nuevo.
  const paraEntrada: MaterialEntrada[] = (materiales ?? [])
    .filter((m) => !m.archivado)
    .map((m) => ({
      id: m.id,
      etiqueta: etiquetaMaterial(m),
      unidad: m.unidad,
      ancho_cm: m.ancho_cm,
      alto_cm: m.alto_cm,
    }));

  // Un retal sólo sale de materiales que se cortan (m²).
  const opciones: OpcionMaterial[] = (materiales ?? []).filter((m) => !m.archivado && m.unidad === "m2").map((material) => ({
    id: material.id,
    etiqueta: material.color
      ? `${material.tipo} · ${material.color}`
      : material.tipo,
    unidad: material.unidad,
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario de sobrantes"
        descripcion="Todo lo que tienes en el taller: láminas completas, retales, rollos y unidades. Los trabajos sacan de aquí."
      >
        <div className="flex gap-2">
          <div className="rounded-lg border bg-card px-4 py-2 text-right">
            <p className="text-xs text-muted-foreground">Valor del inventario</p>
            <p className="text-lg font-bold">{formatearMoneda(valorInventario)}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2 text-right">
            <p className="text-xs text-muted-foreground">En retales</p>
            <p className="text-lg font-bold text-emerald-600">{formatearMoneda(valorDisponible)}</p>
          </div>
        </div>
      </EncabezadoPagina>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-6 pt-1 pb-3">
              <h2 className="font-semibold">Existencias</h2>
              <span className="text-xs text-muted-foreground">Láminas completas, rollos y unidades</span>
            </div>
            {!existencias?.length ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Todavía no hay existencias. Registra lo que tienes con «Entrada de material».
              </p>
            ) : (
              <ul className="flex flex-col divide-y border-t text-sm">
                {existencias.map((e) => {
                  const m = porMaterial.get(e.material_id);
                  const agotado = Number(e.cantidad) <= 0;
                  return (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">{m ? etiquetaMaterial(m) : "—"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {ETIQUETA_CLASE[e.clase]} ·{" "}
                          {agotado ? <strong className="text-destructive">Agotado</strong> : describirCantidad({ ...e, cantidad: Number(e.cantidad) })}
                          {" · "}
                          {formatearMoneda(valorItem({ ...e, cantidad: Number(e.cantidad) }, m))}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        {!agotado ? (
                          <Button size="sm" variant="outline" render={<Link href={`/trabajos?origen_sobrante=${e.id}`} />}>
                            Usar en un trabajo
                          </Button>
                        ) : null}
                        <CorregirCantidad id={e.id} cantidad={Number(e.cantidad)} decimales={admiteDecimales(e.clase)} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <nav aria-label="Ver retales" className="flex gap-2">
          <Link
            href={enlace({ ver: null })}
            aria-current={!verUsados ? "page" : undefined}
            className={
              !verUsados
                ? "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            Retales disponibles ({totalDisponibles ?? 0})
          </Link>
          <Link
            href={enlace({ ver: "usados" })}
            aria-current={verUsados ? "page" : undefined}
            className={
              verUsados
                ? "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            Retales usados ({totalUsados ?? 0})
          </Link>
        </nav>

        {/* Sin la franja de foto la tarjeta es mucho más baja; a tres
            columnas quedaba tan estrecha que la fila de botones se
            recortaba. Con fotos activas se recupera la tercera columna. */}
        <div
          className={
            FOTOS_ACTIVAS
              ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              : "grid gap-4 sm:grid-cols-2"
          }
        >
          {!sobrantes?.length ? (
            <Card className={FOTOS_ACTIVAS ? "sm:col-span-2 xl:col-span-3" : "sm:col-span-2"}>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {verUsados
                  ? "Todavía no hay retales usados ni vendidos."
                  : (totalUsados ?? 0) > 0
                    ? "No hay retales disponibles ahora. Los que ya usaste están en «Retales usados»."
                    : "Todavía no hay retales. Se crean al devolver sobrantes de un trabajo o con «Registrar retal»."}
              </CardContent>
            </Card>
          ) : (
            sobrantes.map((item) => {
              const firma = item.foto_url ? firmas.get(item.foto_url) : null;
              const porUnidad = porMaterial.get(item.material_id)?.unidad === "unidad";
              return (
                <Card
                  key={item.id}
                  className={FOTOS_ACTIVAS ? "overflow-hidden pt-0" : "overflow-hidden"}
                >
                  {/* Sin fotos la tarjeta no reserva la franja de imagen: el
                      código y las medidas quedan arriba del todo. */}
                  {FOTOS_ACTIVAS ? (
                    firma ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={firma}
                        alt={
                          porUnidad
                            ? `Sobrante de ${item.cantidad} unidades`
                            : `Sobrante de ${item.ancho_cm}×${item.alto_cm} cm`
                        }
                        className="h-36 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-muted text-xs text-muted-foreground">
                        Sin foto
                      </div>
                    )
                  ) : null}

                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {item.codigo ? (
                          <p className="font-mono text-xs font-semibold text-emerald-700">
                            {item.codigo}
                          </p>
                        ) : null}
                        {porUnidad ? (
                          <p className="font-semibold">
                            {formatearNumero(item.cantidad)} unidades
                          </p>
                        ) : (
                          <>
                            <p className="font-semibold">
                              {formatearNumero(item.ancho_cm)} ×{" "}
                              {formatearNumero(item.alto_cm)} cm
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatearNumero(areaM2(item.ancho_cm, item.alto_cm))} m²
                              {item.color ? ` · ${item.color}` : ""}
                            </p>
                          </>
                        )}
                      </div>
                      <Badge variant={item.usado ? "secondary" : "default"}>
                        {item.usado ? "Usado" : "Disponible"}
                      </Badge>
                    </div>

                    <p className="text-sm">
                      Valor:{" "}
                      <strong className="text-emerald-600">
                        {formatearMoneda(item.costo_estimado)}
                      </strong>
                    </p>

                    {!item.usado ? (
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="w-full"
                          render={
                            <Link href={`/trabajos?origen_sobrante=${item.id}`} />
                          }
                        >
                          Usar en un trabajo
                        </Button>
                        {/* flex-wrap y no justify-between: en una tarjeta
                            estrecha los tres botones no caben en una línea y
                            el último se recortaba. Así baja de línea. */}
                        <div className="flex flex-wrap items-center gap-1">
                          <DialogoVender id={item.id} codigo={item.codigo} />
                          <form action={marcarUsado}>
                            <input type="hidden" name="id" value={item.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground"
                            >
                              Reutilizar
                            </Button>
                          </form>
                          <form action={eliminarSobrante}>
                            <input type="hidden" name="id" value={item.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              Eliminar
                            </Button>
                          </form>
                        </div>
                      </div>
                    ) : (
                      <form action={eliminarSobrante}>
                        <input type="hidden" name="id" value={item.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          Eliminar
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {totalPaginas > 1 ? (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-2 text-sm">
            {paginaActual > 1 ? (
              <Link href={enlace({ pagina: paginaActual - 1 })} className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted">
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {paginaActual} de {totalPaginas}
            </span>
            {paginaActual < totalPaginas ? (
              <Link href={enlace({ pagina: paginaActual + 1 })} className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted">
                Siguiente →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
        </div>

        <div className="flex flex-col gap-6">
        <FormularioEntrada materiales={paraEntrada} />
        <FormularioSobrante materiales={opciones} trabajos={trabajos ?? []} />
        </div>
      </div>
    </>
  );
}
