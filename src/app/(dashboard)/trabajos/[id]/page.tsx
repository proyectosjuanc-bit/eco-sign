import Link from "next/link";
import { notFound } from "next/navigation";

import { eliminarPieza } from "../actions";
import { SelectorEstado } from "./selector-estado";
import { SelectorEntrega } from "./selector-entrega";
import { DialogoDevolver } from "./dialogo-devolver";
import { BotonRecortes } from "./boton-recortes";
import {
  FormularioDevolver,
  FormularioPiezaEntregada,
  FormularioSalida,
  type OpcionInventario,
  type OpcionMaterialTrabajo,
} from "./formularios-trabajo";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { areaM2, formatearFecha, formatearMoneda, formatearNumero } from "@/lib/format";
import { FOTOS_ACTIVAS, PIEZAS_ACTIVAS } from "@/lib/funciones";
import { describirCantidad, esPorArea, etiquetaMaterial, valorItem } from "@/lib/inventario";
import { createClient } from "@/lib/supabase/server";
import { firmarFotos } from "@/lib/supabase/subir-foto";
import type { ClaseInventario } from "@/types/database";

/**
 * Un trabajo con inventario único: se SACA material del inventario, se
 * registran las PIEZAS que se entregan, se DEVUELVE lo que sobra y se calculan
 * los RECORTES perdidos. Ver trabajos/actions.ts.
 */
export default async function TrabajoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origen_sobrante?: string }>;
}) {
  const { id } = await params;
  const { origen_sobrante: preseleccion } = await searchParams;
  const supabase = await createClient();

  const { data: trabajo } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  // RLS ya limita al taller: una fila ausente es un 404 legítimo.
  if (!trabajo) notFound();

  const [
    { data: lineas },
    { data: materiales },
    { data: ahorros },
    { data: recortes },
    { data: devueltos },
    { data: disponibles },
  ] = await Promise.all([
    supabase.from("job_items").select("*").eq("job_id", id).order("created_at"),
    supabase
      .from("materials")
      .select("id, tipo, color, grosor_mm, costo_unitario, costo_lamina, unidad, archivado, ml_por_m2"),
    supabase.from("savings").select("monto").eq("job_id", id),
    supabase.from("waste_logs").select("id").eq("job_id", id).eq("origen", "recortes"),
    supabase
      .from("inventory_items")
      .select("id, codigo, material_id, ancho_cm, alto_cm, usado, costo_estimado")
      .eq("job_id", id)
      .eq("clase", "retal")
      .order("created_at"),
    // Lo que se puede sacar: retales sin usar y existencias con cantidad.
    supabase
      .from("inventory_items")
      .select("id, clase, material_id, codigo, ancho_cm, alto_cm, cantidad")
      .or("and(clase.eq.retal,usado.eq.false),and(clase.neq.retal,cantidad.gt.0)")
      .order("codigo"),
  ]);

  const porMaterial = new Map((materiales ?? []).map((m) => [m.id, m]));
  const salidas = (lineas ?? []).filter((l) => l.modo === "salida");
  const piezas = (lineas ?? []).filter((l) => l.modo === "pieza");

  // Clase y código de lo que salió (puede estar ya usado o agotado).
  const idsSalida = salidas.map((s) => s.inventory_item_id).filter((v): v is string => Boolean(v));
  const { data: itemsSalida } = idsSalida.length
    ? await supabase.from("inventory_items").select("id, clase, codigo").in("id", idsSalida)
    : { data: [] };
  const claseDe = new Map((itemsSalida ?? []).map((i) => [i.id, i]));

  const firmas = FOTOS_ACTIVAS
    ? await firmarFotos(supabase, piezas.map((p) => p.foto_url))
    : new Map<string, string>();

  // --- Cifras -----------------------------------------------------------------
  const valorSalida = (s: (typeof salidas)[number]) => {
    const item = s.inventory_item_id ? claseDe.get(s.inventory_item_id) : undefined;
    const clase = (item?.clase ?? "lamina") as ClaseInventario;
    return valorItem(
      { clase, ancho_cm: s.ancho_cm, alto_cm: s.alto_cm, cantidad: Number(s.cantidad), costo_estimado: null },
      porMaterial.get(s.material_id),
    );
  };
  const costoSacado = salidas.reduce((t, s) => t + valorSalida(s), 0);
  const valorDevuelto = (devueltos ?? []).reduce((t, d) => t + Number(d.costo_estimado ?? 0), 0);
  const ahorroTotal = (ahorros ?? []).reduce((t, a) => t + Number(a.monto), 0);

  // Recortes: por material que se corta, sacado − piezas − devueltos.
  const recorte = new Map<string, { sacado: number; aprovechado: number }>();
  for (const l of lineas ?? []) {
    if (!esPorArea(porMaterial.get(l.material_id)?.unidad)) continue;
    const area = areaM2(l.ancho_cm, l.alto_cm) * Number(l.cantidad);
    const acc = recorte.get(l.material_id) ?? { sacado: 0, aprovechado: 0 };
    if (l.modo === "salida") acc.sacado += area;
    else acc.aprovechado += area;
    recorte.set(l.material_id, acc);
  }
  for (const d of devueltos ?? []) {
    const acc = recorte.get(d.material_id);
    if (acc) acc.aprovechado += areaM2(d.ancho_cm, d.alto_cm);
  }
  let sacadoM2 = 0;
  let aprovechadoM2 = 0;
  let costoPerdido = 0;
  for (const [materialId, { sacado, aprovechado }] of recorte) {
    if (sacado <= 0) continue;
    sacadoM2 += sacado;
    aprovechadoM2 += aprovechado;
    costoPerdido += Math.max(sacado - aprovechado, 0) * (porMaterial.get(materialId)?.costo_unitario ?? 0);
  }

  // --- Opciones de los formularios ------------------------------------------
  const opcionesInventario: OpcionInventario[] = (disponibles ?? []).flatMap((i) => {
    const m = porMaterial.get(i.material_id);
    if (!m) return [];
    return [{
      id: i.id,
      clase: i.clase,
      material: etiquetaMaterial(m),
      codigo: i.codigo,
      ancho_cm: i.ancho_cm,
      alto_cm: i.alto_cm,
      cantidad: Number(i.cantidad),
      material_id: m.id,
      precio: Number(m.costo_unitario),
      ml_por_m2: m.ml_por_m2 == null ? null : Number(m.ml_por_m2),
    }];
  });

  // Líquidos del catálogo sin nada en el inventario: en «Tintas de impresión»
  // se muestran sin poder marcarse, para que se vea que falta darles entrada.
  const conExistencias = new Set(opcionesInventario.map((o) => o.material_id));
  const liquidosSinExistencias = (materiales ?? [])
    .filter((m) => m.unidad === "ml" && !m.archivado && !conExistencias.has(m.id))
    .map((m) => etiquetaMaterial(m))
    .sort((a, b) => a.localeCompare(b, "es"));

  // Piezas y sobrantes: sólo de los materiales que se cortan y que salieron
  // del inventario en este trabajo.
  const materialesCortados: OpcionMaterialTrabajo[] = [
    ...new Set(salidas.map((s) => s.material_id)),
  ]
    .map((mid) => porMaterial.get(mid))
    .filter((m): m is NonNullable<typeof m> => Boolean(m) && esPorArea(m?.unidad))
    .map((m) => ({ id: m.id, etiqueta: etiquetaMaterial(m) }));

  const nombre = (materialId: string) => {
    const m = porMaterial.get(materialId);
    return m ? etiquetaMaterial(m) : "—";
  };

  return (
    <>
      <EncabezadoPagina
        titulo={trabajo.nombre}
        descripcion={`${trabajo.cliente ?? "Sin cliente"} · ${formatearFecha(trabajo.fecha)}`}
      >
        <div className="flex items-center gap-2">
          <SelectorEntrega key={trabajo.fecha_entrega ?? "sin"} jobId={trabajo.id} fecha={trabajo.fecha_entrega} />
          <SelectorEstado key={trabajo.estado} jobId={trabajo.id} estado={trabajo.estado} />
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/trabajos" />}>
            Volver
          </Button>
        </div>
      </EncabezadoPagina>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Resumen titulo="Material sacado del inventario" valor={formatearMoneda(costoSacado)} />
        <Resumen titulo="Sobrantes devueltos" valor={formatearMoneda(valorDevuelto)} />
        <Resumen titulo="Ahorro por usar retales" valor={formatearMoneda(ahorroTotal)} destacado />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* --- Lo sacado --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Material sacado del inventario</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!salidas.length ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Todavía no has sacado material para este trabajo (paso 1).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Qué salió</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salidas.map((s) => {
                      const item = s.inventory_item_id ? claseDe.get(s.inventory_item_id) : undefined;
                      const clase = (item?.clase ?? "lamina") as ClaseInventario;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {nombre(s.material_id)}
                            {clase === "retal" ? (
                              <Badge className="ml-2 bg-emerald-600 text-white">Retal reutilizado</Badge>
                            ) : null}
                            {clase === "mililitros" && s.descripcion ? (
                              <span className="block text-xs font-normal text-muted-foreground">{s.descripcion}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {clase === "retal" && item?.codigo ? `${item.codigo} · ` : ""}
                            {describirCantidad({ clase, ancho_cm: s.ancho_cm, alto_cm: s.alto_cm, cantidad: Number(s.cantidad) })}
                          </TableCell>
                          <TableCell className="text-right">{formatearMoneda(valorSalida(s))}</TableCell>
                          <TableCell>
                            {clase === "metros" || clase === "unidades" || clase === "mililitros" ? (
                              <DialogoDevolver
                                id={s.id}
                                jobId={trabajo.id}
                                clase={clase}
                                material={nombre(s.material_id)}
                                sacado={Number(s.cantidad)}
                                precio={Number(porMaterial.get(s.material_id)?.costo_unitario ?? 0)}
                                anchoSugerido={anchoDelNombre(nombre(s.material_id))}
                              />
                            ) : (
                              <BotonQuitar id={s.id} jobId={trabajo.id} etiqueta="Devolver" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {PIEZAS_ACTIVAS ? (
          <>
          {/* --- Piezas --- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Piezas que se entregan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!piezas.length ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Todavía no has registrado piezas (paso 2).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {FOTOS_ACTIVAS ? <TableHead className="w-0" /> : null}
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Medidas</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Área</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {piezas.map((p) => {
                      const firma = p.foto_url ? firmas.get(p.foto_url) : null;
                      return (
                        <TableRow key={p.id}>
                          {FOTOS_ACTIVAS ? (
                            <TableCell>
                              {firma ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  loading="lazy"
                                  decoding="async"
                                  src={firma}
                                  alt={p.descripcion ?? "Foto de la pieza"}
                                  className="size-10 rounded object-cover"
                                />
                              ) : (
                                <div className="size-10 rounded bg-muted" />
                              )}
                            </TableCell>
                          ) : null}
                          <TableCell className="font-medium">
                            {nombre(p.material_id)}
                            {p.descripcion ? (
                              <span className="block text-xs font-normal text-muted-foreground">{p.descripcion}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatearNumero(p.ancho_cm)} × {formatearNumero(p.alto_cm)} cm
                          </TableCell>
                          <TableCell className="text-right">{formatearNumero(Number(p.cantidad))}</TableCell>
                          <TableCell className="text-right">
                            {formatearNumero(areaM2(p.ancho_cm, p.alto_cm) * Number(p.cantidad))} m²
                          </TableCell>
                          <TableCell>
                            <BotonQuitar id={p.id} jobId={trabajo.id} etiqueta="Quitar" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          </>
          ) : null}

          {/* --- Devueltos --- */}
          {devueltos?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sobrantes devueltos al inventario</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y text-sm">
                  {devueltos.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-mono text-xs font-semibold text-emerald-700">{d.codigo}</span>{" "}
                        {nombre(d.material_id)} · {formatearNumero(d.ancho_cm)} × {formatearNumero(d.alto_cm)} cm
                      </span>
                      <Badge variant={d.usado ? "secondary" : "default"}>{d.usado ? "Usado" : "Disponible"}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <FormularioSalida
            jobId={trabajo.id}
            opciones={opcionesInventario}
            preseleccion={preseleccion ?? null}
            liquidosSinExistencias={liquidosSinExistencias}
          />
          {PIEZAS_ACTIVAS ? (
            <FormularioPiezaEntregada jobId={trabajo.id} materiales={materialesCortados} />
          ) : null}
          <FormularioDevolver
            jobId={trabajo.id}
            materiales={materialesCortados}
            numero={PIEZAS_ACTIVAS ? 3 : 2}
          />
          {PIEZAS_ACTIVAS ? (
            <BotonRecortes
              jobId={trabajo.id}
              consumidoM2={Number(sacadoM2.toFixed(2))}
              aprovechadoM2={Number(aprovechadoM2.toFixed(2))}
              costoPerdido={Number(costoPerdido.toFixed(2))}
              yaCalculado={Boolean(recortes?.length)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * Ancho del rollo escrito en el nombre del material: «Vinilo de corte x 60»,
 * «Vinilo 1,22 m», «Lona 150 cm». Sólo sugiere el valor del diálogo.
 */
function anchoDelNombre(nombre: string): number | null {
  const enCm = nombre.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i) ?? nombre.match(/[x×]\s*(\d+(?:[.,]\d+)?)(?![\d.,]|\s*m\b)/i);
  if (enCm) return Number(enCm[1].replace(",", "."));
  const enM = nombre.match(/(\d+(?:[.,]\d+)?)\s*m\b/i);
  return enM ? Math.round(Number(enM[1].replace(",", ".")) * 100) : null;
}

/** Quita una línea; si es una salida, el material vuelve al inventario. */
function BotonQuitar({ id, jobId, etiqueta }: { id: string; jobId: string; etiqueta: string }) {
  return (
    <form action={eliminarPieza}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="job_id" value={jobId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        title={etiqueta === "Devolver" ? "Quitar esta salida: el material vuelve al inventario" : "Quitar esta pieza"}
      >
        {etiqueta}
      </Button>
    </form>
  );
}

function Resumen({ titulo, valor, destacado = false }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={`mt-1 text-xl font-bold ${destacado ? "text-emerald-600" : ""}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
