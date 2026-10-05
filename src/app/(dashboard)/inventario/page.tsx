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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { areaM2, formatearMoneda, formatearNumero } from "@/lib/format";
import { FOTOS_ACTIVAS } from "@/lib/funciones";
import { ETIQUETA_CLASE, admiteDecimales, describirCantidad, etiquetaMaterial, valorItem } from "@/lib/inventario";
import { createClient } from "@/lib/supabase/server";
import { firmarFotos } from "@/lib/supabase/subir-foto";
import { CLASE_DESPLAZABLE } from "@/components/ui/cuadro-desplazable";

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
              <span className="text-xs text-muted-foreground">Láminas completas, rollos, unidades y líquidos</span>
            </div>
            {!existencias?.length ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Todavía no hay existencias. Registra lo que tienes con «Entrada de material».
              </p>
            ) : (
              <ul className={`flex flex-col divide-y border-t text-sm ${CLASE_DESPLAZABLE}`}>
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

        <Card>
          <CardContent className="p-0">
            {!sobrantes?.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                {verUsados
                  ? "Todavía no hay retales usados ni vendidos."
                  : (totalUsados ?? 0) > 0
                    ? "No hay retales disponibles ahora. Los que ya usaste están en «Retales usados»."
                    : "Todavía no hay retales. Se crean al devolver sobrantes de un trabajo o con «Registrar retal»."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {FOTOS_ACTIVAS ? <TableHead className="w-0">Foto</TableHead> : null}
                    <TableHead>Retal</TableHead>
                    <TableHead className="text-right">Medidas</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sobrantes.map((item) => {
                    const firma = item.foto_url ? firmas.get(item.foto_url) : null;
                    const material = porMaterial.get(item.material_id);
                    const porUnidad = material?.unidad === "unidad";
                    const medidas = porUnidad
                      ? `${formatearNumero(item.cantidad)} unidades`
                      : `${formatearNumero(item.ancho_cm)} × ${formatearNumero(item.alto_cm)} cm`;
                    return (
                      <TableRow key={item.id}>
                        {FOTOS_ACTIVAS ? (
                          <TableCell className="align-top">
                            {firma ? (
                              <a href={firma} target="_blank" rel="noopener noreferrer" title="Ver la foto completa">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  loading="lazy"
                                  decoding="async"
                                  src={firma}
                                  alt={`Foto del retal ${item.codigo ?? ""} de ${medidas}`}
                                  className="size-10 rounded object-cover"
                                />
                              </a>
                            ) : (
                              <div className="size-10 rounded bg-muted" />
                            )}
                          </TableCell>
                        ) : null}
                        {/* Código, material y botones en una sola columna: en
                            el celular la tabla cabe sin deslizar de lado. */}
                        <TableCell className="whitespace-normal">
                          <span className="font-mono text-xs font-semibold text-emerald-700">
                            {item.codigo ?? "Sin código"}
                          </span>
                          {item.usado ? (
                            <Badge variant="secondary" className="ml-2">Usado</Badge>
                          ) : null}
                          <span className="block font-medium">
                            {material ? etiquetaMaterial(material) : "—"}
                          </span>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {!item.usado ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  render={<Link href={`/trabajos?origen_sobrante=${item.id}`} />}
                                >
                                  Usar en un trabajo
                                </Button>
                                <DialogoVender id={item.id} codigo={item.codigo} />
                                <form action={marcarUsado}>
                                  <input type="hidden" name="id" value={item.id} />
                                  <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
                                    Reutilizar
                                  </Button>
                                </form>
                              </>
                            ) : null}
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
                        </TableCell>
                        <TableCell className="text-right align-top">
                          {medidas}
                          {!porUnidad ? (
                            <span className="block text-xs text-muted-foreground">
                              {formatearNumero(areaM2(item.ancho_cm, item.alto_cm))} m²
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right align-top font-medium text-emerald-600">
                          {formatearMoneda(item.costo_estimado)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
