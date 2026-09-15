import Link from "next/link";
import { notFound } from "next/navigation";

import { cambiarEstado, eliminarPieza } from "../actions";
import { FormularioConsumo } from "./formulario-consumo";
import { BotonRecortes } from "./boton-recortes";
import {
  FormularioPieza,
  type OpcionLamina,
  type OpcionSobrante,
} from "./formulario-pieza";
import type { OpcionMaterial } from "../../inventario/formulario-sobrante";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
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
import { areaM2, formatearFecha, formatearMoneda, formatearNumero } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { firmarFotos } from "@/lib/supabase/subir-foto";

/** En Next 16 los params y searchParams de una ruta llegan como promesa. */
export default async function TrabajoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origen_sobrante?: string }>;
}) {
  const { id } = await params;
  const { origen_sobrante: origenSobranteId } = await searchParams;
  const supabase = await createClient();

  const { data: trabajo } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // RLS ya limita al tenant, así que una fila ausente es un 404 legítimo.
  if (!trabajo) notFound();

  const [
    { data: piezas },
    { data: materiales },
    { data: ahorros },
    { data: recortes },
    { data: sobrantesLigados },
    { data: sobrantesDisponibles },
  ] = await Promise.all([
    supabase.from("job_items").select("*").eq("job_id", id),
    // ancho_cm/alto_cm/costo_lamina/stock_laminas hacen falta para el
    // selector de "lámina nueva de stock" al añadir una pieza.
    supabase
      .from("materials")
      .select(
        "id, tipo, color, costo_unitario, unidad, ancho_cm, alto_cm, costo_lamina, stock_laminas",
      ),
    supabase.from("savings").select("monto, tipo, descripcion").eq("job_id", id),
    supabase
      .from("waste_logs")
      .select("id, costo")
      .eq("job_id", id)
      .eq("origen", "recortes"),
    // Sobrantes registrados directamente en Inventario y ligados a este
    // trabajo (no vienen de la casilla al añadir una pieza, que ya cuenta
    // en job_items): se muestran también como "aprovechado", para que este
    // panel coincida con lo que de verdad calcula cerrarConRecortes.
    supabase
      .from("inventory_items")
      .select("ancho_cm, alto_cm, material_id")
      .eq("job_id", id),
    // Sobrantes que se pueden elegir como origen de un corte nuevo.
    supabase
      .from("inventory_items")
      .select("id, codigo, ancho_cm, alto_cm, material_id, color")
      .eq("usado", false)
      .order("codigo"),
  ]);

  const porMaterial = new Map((materiales ?? []).map((m) => [m.id, m]));
  const firmas = await firmarFotos(supabase, (piezas ?? []).map((p) => p.foto_url));

  // Los materiales "por unidad" (tornillos, luces LED, estructuras…) no se
  // cortan de una lámina: su consumo no se mide en m², así que quedan fuera
  // de las cifras de área. Su costo sí se suma en costoTeorico más abajo.
  const esPorArea = (materialId: string) =>
    porMaterial.get(materialId)?.unidad !== "unidad";

  // Consumo teórico: la suma del área de cada pieza por su cantidad.
  const consumoTeorico = (piezas ?? [])
    .filter((pieza) => esPorArea(pieza.material_id))
    .reduce(
      (total, pieza) => total + areaM2(pieza.ancho_cm, pieza.alto_cm) * pieza.cantidad,
      0,
    );

  // Separado por modo: lo que salió de bodega frente a lo que acabó en piezas.
  // La diferencia son los recortes que no se pueden aprovechar.
  const materialesConLamina = new Set(
    (piezas ?? [])
      .filter((pieza) => pieza.modo === "lamina")
      .map((pieza) => pieza.material_id),
  );

  const consumidoM2 = (piezas ?? [])
    .filter((pieza) => pieza.modo === "lamina" && esPorArea(pieza.material_id))
    .reduce(
      (total, p) => total + areaM2(p.ancho_cm, p.alto_cm) * p.cantidad,
      0,
    );

  const aprovechadoEnPiezasM2 = (piezas ?? [])
    .filter((pieza) => pieza.modo !== "lamina" && esPorArea(pieza.material_id))
    .reduce(
      (total, p) => total + areaM2(p.ancho_cm, p.alto_cm) * p.cantidad,
      0,
    );

  // Mismo criterio que cerrarConRecortes: sólo cuenta si el sobrante es del
  // mismo material que alguna lámina registrada en este trabajo, porque sin
  // eso no hay de qué restarlo.
  const aprovechadoEnInventarioM2 = (sobrantesLigados ?? [])
    .filter((s) => s.material_id && materialesConLamina.has(s.material_id))
    .reduce((total, s) => total + areaM2(s.ancho_cm, s.alto_cm), 0);

  const aprovechadoM2 = aprovechadoEnPiezasM2 + aprovechadoEnInventarioM2;

  const costoTeorico = (piezas ?? []).reduce((total, pieza) => {
    const material = porMaterial.get(pieza.material_id);
    if (!material) return total;
    const area = areaM2(pieza.ancho_cm, pieza.alto_cm) * pieza.cantidad;
    return (
      total +
      (material.unidad === "m2"
        ? area * material.costo_unitario
        : material.costo_unitario * pieza.cantidad)
    );
  }, 0);

  // Costo medio por m², el precio al que se valora cada m² ahorrado.
  const costoM2 = consumoTeorico > 0 ? costoTeorico / consumoTeorico : 0;
  const ahorroTotal = (ahorros ?? []).reduce((total, a) => total + a.monto, 0);

  const opciones: OpcionMaterial[] = (materiales ?? []).map((material) => ({
    id: material.id,
    etiqueta: material.color
      ? `${material.tipo} · ${material.color}`
      : material.tipo,
    unidad: material.unidad,
  }));

  // Láminas nuevas de stock: sólo materiales que de verdad vienen en láminas
  // con existencias, para no ofrecer un origen que luego falla al descontar.
  const laminasDisponibles: OpcionLamina[] = (materiales ?? [])
    .filter(
      (material) =>
        (material.stock_laminas ?? 0) > 0 &&
        material.ancho_cm != null &&
        material.alto_cm != null,
    )
    .map((material) => ({
      id: material.id,
      etiqueta: material.color
        ? `${material.tipo} · ${material.color}`
        : material.tipo,
      ancho_cm: material.ancho_cm as number,
      alto_cm: material.alto_cm as number,
      stock_laminas: material.stock_laminas ?? 0,
    }));

  const sobrantesOpciones: OpcionSobrante[] = (sobrantesDisponibles ?? []).map(
    (sobrante) => {
      const material = porMaterial.get(sobrante.material_id);
      return {
        id: sobrante.id,
        codigo: sobrante.codigo,
        material_id: sobrante.material_id,
        ancho_cm: sobrante.ancho_cm,
        alto_cm: sobrante.alto_cm,
        etiqueta: material
          ? material.color
            ? `${material.tipo} · ${material.color}`
            : material.tipo
          : (sobrante.color ?? "Material"),
      };
    },
  );

  return (
    <>
      <EncabezadoPagina
        titulo={trabajo.nombre}
        descripcion={`${trabajo.cliente ?? "Sin cliente"} · ${formatearFecha(trabajo.fecha)}`}
      >
        <div className="flex items-center gap-2">
          <form action={cambiarEstado} className="flex items-center gap-2">
            <input type="hidden" name="id" value={trabajo.id} />
            <select
              name="estado"
              defaultValue={trabajo.estado}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="terminado">Terminado</option>
            </select>
            <Button type="submit" variant="outline" size="sm">
              Guardar
            </Button>
          </form>
          <Button variant="ghost" size="sm" render={<Link href="/trabajos" />}>
            Volver
          </Button>
        </div>
      </EncabezadoPagina>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Resumen
          titulo="Consumo teórico"
          valor={`${formatearNumero(consumoTeorico)} m²`}
        />
        <Resumen titulo="Costo teórico" valor={formatearMoneda(costoTeorico)} />
        <Resumen
          titulo="Ahorro registrado"
          valor={formatearMoneda(ahorroTotal)}
          destacado
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-0">
            {!piezas?.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                Este trabajo aún no tiene piezas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-0" />
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Medidas</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Área</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {piezas.map((pieza) => {
                    const material = porMaterial.get(pieza.material_id);
                    const area =
                      areaM2(pieza.ancho_cm, pieza.alto_cm) * pieza.cantidad;
                    const firma = pieza.foto_url
                      ? firmas.get(pieza.foto_url)
                      : null;
                    return (
                      <TableRow key={pieza.id}>
                        <TableCell>
                          {firma ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={firma}
                              alt={pieza.descripcion ?? "Foto de la pieza"}
                              className="size-10 rounded object-cover"
                            />
                          ) : (
                            <div className="size-10 rounded bg-muted" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span className="flex flex-col">
                            <span>{material?.tipo ?? "—"}</span>
                            {pieza.descripcion ? (
                              <span className="text-xs font-normal text-muted-foreground">
                                {pieza.descripcion}
                              </span>
                            ) : null}
                            {pieza.modo === "lamina" ? (
                              <span className="text-xs font-normal text-emerald-700">
                                Lámina consumida
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatearNumero(pieza.ancho_cm)} ×{" "}
                          {formatearNumero(pieza.alto_cm)} cm
                        </TableCell>
                        <TableCell className="text-right">{pieza.cantidad}</TableCell>
                        <TableCell className="text-right">
                          {formatearNumero(area)} m²
                        </TableCell>
                        <TableCell>
                          <form action={eliminarPieza}>
                            <input type="hidden" name="id" value={pieza.id} />
                            <input type="hidden" name="job_id" value={trabajo.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              Quitar
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <FormularioPieza
            jobId={trabajo.id}
            materiales={opciones}
            laminas={laminasDisponibles}
            sobrantes={sobrantesOpciones}
            origenSobranteId={origenSobranteId ?? null}
          />
          <BotonRecortes
            jobId={trabajo.id}
            consumidoM2={Number(consumidoM2.toFixed(2))}
            aprovechadoM2={Number(aprovechadoM2.toFixed(2))}
            costoM2={Number(costoM2.toFixed(2))}
            yaCalculado={Boolean(recortes?.length)}
          />
          <FormularioConsumo
            jobId={trabajo.id}
            consumoTeorico={Number(consumoTeorico.toFixed(2))}
            costoM2={Number(costoM2.toFixed(2))}
          />
        </div>
      </div>
    </>
  );
}

function Resumen({
  titulo,
  valor,
  destacado = false,
}: {
  titulo: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={`mt-1 text-xl font-bold ${destacado ? "text-emerald-600" : ""}`}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}
