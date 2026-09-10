import Link from "next/link";
import type { Metadata } from "next";

import { GraficoAhorro, type PuntoAhorro } from "@/components/dashboard/grafico-ahorro";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearMoneda, formatearNumero } from "@/lib/format";
import { aFechaIso, calcularRoi, etiquetaMes, rangoMesActual } from "@/lib/roi";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard · ECO-SIGN" };

/** Meses que abarca el gráfico de ahorro acumulado. */
const MESES_HISTORIA = 6;

export default async function DashboardPage() {
  const supabase = await createClient();
  const hoy = new Date();
  const { inicio, fin } = rangoMesActual(hoy);

  // Se arranca en el primer día del mes más antiguo del gráfico.
  const inicioHistoria = aFechaIso(
    new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_HISTORIA - 1), 1),
  );

  const [{ data: ahorros }, { data: desperdicios }, { data: sobrantes }] =
    await Promise.all([
      supabase
        .from("savings")
        .select("monto, tipo, fecha, descripcion")
        .gte("fecha", inicioHistoria)
        .order("fecha"),
      supabase.from("waste_logs").select("costo"),
      supabase.from("inventory_items").select("costo_estimado, usado"),
    ]);

  const filas = ahorros ?? [];

  const ahorroMes = filas
    .filter((fila) => fila.fecha >= inicio && fila.fecha <= fin)
    .reduce((total, fila) => total + fila.monto, 0);

  const roi = calcularRoi(ahorroMes);

  const costoDesperdicio = (desperdicios ?? []).reduce(
    (total, fila) => total + (fila.costo ?? 0),
    0,
  );

  const valorDisponible = (sobrantes ?? [])
    .filter((item) => !item.usado)
    .reduce((total, item) => total + (item.costo_estimado ?? 0), 0);

  // Serie del gráfico: un punto por mes, con el acumulado corriendo.
  const porMes = new Map<string, number>();
  for (const fila of filas) {
    const clave = fila.fecha.slice(0, 7);
    porMes.set(clave, (porMes.get(clave) ?? 0) + fila.monto);
  }

  const puntos: PuntoAhorro[] = Array.from(
    { length: MESES_HISTORIA },
    (_, i) => {
      const fecha = new Date(
        hoy.getFullYear(),
        hoy.getMonth() - (MESES_HISTORIA - 1) + i,
        1,
      );
      const clave = aFechaIso(fecha).slice(0, 7);
      return {
        fecha,
        clave,
        etiqueta: etiquetaMes(fecha),
        mes: porMes.get(clave) ?? 0,
      };
    },
  ).map((punto, indice, todos) => ({
    etiqueta: punto.etiqueta,
    mes: punto.mes,
    // El acumulado es la suma de todos los meses hasta este, inclusive.
    acumulado: todos
      .slice(0, indice + 1)
      .reduce((total, anterior) => total + anterior.mes, 0),
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="ROI Circular"
        descripcion="Cuánto te devuelve reutilizar sobrantes y desperdiciar menos."
      >
        <Link
          href="/guia"
          className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cómo funciona
        </Link>
      </EncabezadoPagina>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          titulo="Ahorro del mes"
          valor={formatearMoneda(roi.ahorroMes)}
          nota="Suma de ahorros registrados este mes"
          acento="emerald"
        />
        <Metrica
          titulo="Suscripción"
          valor={formatearMoneda(roi.suscripcion)}
          nota="Costo fijo mensual del software"
        />
        <Metrica
          titulo="Beneficio adicional"
          valor={formatearMoneda(roi.beneficioAdicional)}
          nota={
            roi.seAutofinancia
              ? "Tu desperdicio ya paga el software"
              : "Falta ahorro para cubrir la suscripción"
          }
          acento={roi.seAutofinancia ? "emerald" : "destructive"}
        />
        <Metrica
          titulo="ROI Circular"
          valor={`${formatearNumero(roi.roiCircular)}×`}
          nota="Veces que el ahorro cubre la suscripción"
          acento={roi.seAutofinancia ? "emerald" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Ahorro acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoAhorro puntos={puntos} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sobrantes disponibles</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">
                {formatearMoneda(valorDisponible)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Material listo para reutilizar en el{" "}
                <Link href="/inventario" className="underline underline-offset-4">
                  inventario
                </Link>
                .
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desperdicio acumulado</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">
                {formatearMoneda(costoDesperdicio)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Lo que costó el material perdido hasta hoy.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {filas.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="text-sm text-muted-foreground">
            Todavía no hay ahorros registrados. Marca un sobrante como reutilizado
            en el{" "}
            <Link href="/inventario" className="underline underline-offset-4">
              inventario
            </Link>{" "}
            o registra el consumo real de un{" "}
            <Link href="/trabajos" className="underline underline-offset-4">
              trabajo
            </Link>{" "}
            para ver aquí el ROI.
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Metrica({
  titulo,
  valor,
  nota,
  acento,
}: {
  titulo: string;
  valor: string;
  nota: string;
  acento?: "emerald" | "destructive";
}) {
  const color =
    acento === "emerald"
      ? "text-emerald-600"
      : acento === "destructive"
        ? "text-destructive"
        : "";

  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}
