import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GraficoAhorro, type PuntoAhorro } from "@/components/dashboard/grafico-ahorro";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearMoneda, formatearNumero } from "@/lib/format";
import { hoyEnColombia } from "@/lib/capacidad/tipos";
import { MOSTRAR_ROI } from "@/lib/funciones";
import { aFechaIso, calcularRoi, etiquetaMes, rangoMesActual } from "@/lib/roi";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";
import { estadoEntrega } from "@/lib/trabajos";

export const metadata: Metadata = { title: "Dashboard · ECO-SIGN" };

/** Meses que abarca el gráfico de ahorro acumulado. */
const MESES_HISTORIA = 6;

export default async function DashboardPage() {
  const supabase = await createClient();

  // El Dashboard (ahorro, ROI, costos del taller) es sólo para administradores.
  // Muchas entradas llevan aquí (login, confirmación, invitación, la app
  // instalada): a operarios y usuarios de solo lectura se les envía a
  // Trabajos, que es su pantalla del día a día.
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) redirect("/trabajos");
  const hoy = new Date();
  const { inicio, fin } = rangoMesActual(hoy);

  // Se arranca en el primer día del mes más antiguo del gráfico.
  const inicioHistoria = aFechaIso(
    new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_HISTORIA - 1), 1),
  );

  const tenantId = await obtenerTenantId();
  // Primer instante del mes en Colombia, para comparar con fechas de la base.
  const inicioMes = new Date(`${inicio}T00:00:00-05:00`).getTime();
  const desdeEsteMes = (fecha: string | null) => fecha != null && new Date(fecha).getTime() >= inicioMes;

  const [
    { data: ahorros },
    { data: desperdicios },
    { data: valorPorClase },
    { data: trabajosAbiertos },
    { data: cobros },
    { count: porResponder },
  ] =
    await Promise.all([
      supabase
        .from("savings")
        .select("monto, tipo, fecha, descripcion")
        .gte("fecha", inicioHistoria)
        .order("fecha"),
      supabase.from("waste_logs").select("costo, created_at"),
      // Valor de lo que hay en bodega, sumado en la base por clase.
      supabase.rpc("valor_inventario"),
      supabase.from("jobs").select("estado, fecha_entrega").in("estado", ["pendiente", "en_proceso"]),
      // Capacidad: lo que este taller cobró por prestar sus máquinas.
      tenantId
        ? supabase
            .from("machine_requests")
            .select("monto_cobrado, completada_en")
            .eq("tenant_propietario", tenantId)
            .eq("estado", "completada")
        : Promise.resolve({ data: [] as { monto_cobrado: number | null; completada_en: string | null }[] }),
      tenantId
        ? supabase
            .from("machine_requests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_propietario", tenantId)
            .eq("estado", "pendiente")
        : Promise.resolve({ count: 0 }),
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
  const desperdicioMes = (desperdicios ?? [])
    .filter((fila) => desdeEsteMes(fila.created_at))
    .reduce((total, fila) => total + (fila.costo ?? 0), 0);

  const enProceso = (trabajosAbiertos ?? []).filter((t) => t.estado === "en_proceso").length;
  const pendientes = (trabajosAbiertos ?? []).filter((t) => t.estado === "pendiente").length;
  const hoyColombia = hoyEnColombia();
  const atrasados = (trabajosAbiertos ?? []).filter(
    (t) => estadoEntrega(t.fecha_entrega, t.estado, hoyColombia) === "atrasado",
  ).length;

  // Capacidad: completadas como dueño de la máquina.
  const completadas = cobros ?? [];
  const completadasMes = completadas.filter((c) => desdeEsteMes(c.completada_en));
  const ingresosMes = completadasMes.reduce((t, c) => t + Number(c.monto_cobrado ?? 0), 0);
  const ingresosTotal = completadas.reduce((t, c) => t + Number(c.monto_cobrado ?? 0), 0);
  const sinCobroRegistrado = completadas.filter((c) => c.monto_cobrado == null).length;

  const valorInventario = (valorPorClase ?? []).reduce((t, f) => t + Number(f.valor), 0);
  const valorDisponible = Number(
    (valorPorClase ?? []).find((f) => f.clase === "retal")?.valor ?? 0,
  );

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
        titulo="Resumen del taller"
        descripcion="Lo que ahorras reutilizando, lo que se pierde y lo que ganas prestando tus máquinas."
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
          nota="Por reutilizar retales en vez de material nuevo"
          acento="emerald"
        />
        <Metrica
          titulo="Desperdicio del mes"
          valor={formatearMoneda(desperdicioMes)}
          nota="Lo que costó el material perdido este mes"
          acento={desperdicioMes > 0 ? "destructive" : undefined}
        />
        <Metrica
          titulo="Trabajos en proceso"
          valor={formatearNumero(enProceso)}
          nota={
            atrasados
              ? `⚠ ${formatearNumero(atrasados)} ${atrasados === 1 ? "atrasado" : "atrasados"} · ${formatearNumero(pendientes)} por empezar`
              : `${formatearNumero(pendientes)} ${pendientes === 1 ? "pendiente" : "pendientes"} por empezar`
          }
          acento={atrasados ? "destructive" : undefined}
          href="/trabajos"
        />
        <Metrica
          titulo="Ingresos por Capacidad"
          valor={formatearMoneda(ingresosMes)}
          nota={`Este mes · ${formatearNumero(completadasMes.length)} ${completadasMes.length === 1 ? "préstamo completado" : "préstamos completados"}`}
          acento={ingresosMes > 0 ? "emerald" : undefined}
          href="/capacidad/solicitudes-recibidas"
        />
      </div>

      {MOSTRAR_ROI ? (
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
      ) : null}

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
              <CardTitle className="text-base">Capacidad</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                <span className="text-2xl font-bold text-emerald-600">{formatearMoneda(ingresosTotal)}</span>
                <span className="block text-muted-foreground">
                  ganados prestando tus máquinas a otros talleres ({formatearNumero(completadas.length)}{" "}
                  {completadas.length === 1 ? "préstamo" : "préstamos"} en total).
                </span>
              </p>
              {porResponder ? (
                <Link
                  href="/capacidad/solicitudes-recibidas"
                  className="rounded-md bg-amber-50 px-3 py-2 font-medium text-amber-900 hover:bg-amber-100"
                >
                  {porResponder} {porResponder === 1 ? "solicitud" : "solicitudes"} por responder →
                </Link>
              ) : null}
              {sinCobroRegistrado ? (
                <Link
                  href="/capacidad/solicitudes-recibidas"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {sinCobroRegistrado} {sinCobroRegistrado === 1 ? "préstamo completado" : "préstamos completados"} sin lo cobrado
                  registrado: anótalo para que sume aquí.
                </Link>
              ) : null}
              {!completadas.length && !porResponder ? (
                <p className="text-xs text-muted-foreground">
                  Publica tus máquinas en{" "}
                  <Link href="/capacidad" className="underline underline-offset-4">
                    Capacidad
                  </Link>{" "}
                  para ganar con el tiempo en que están quietas.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inventario</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatearMoneda(valorInventario)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Todo lo que hay en bodega. De eso,{" "}
                <strong className="text-emerald-600">{formatearMoneda(valorDisponible)}</strong> en
                retales listos para reutilizar en el{" "}
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
            Todavía no hay ahorros registrados. El ahorro aparece cuando un{" "}
            <Link href="/trabajos" className="underline underline-offset-4">
              trabajo
            </Link>{" "}
            usa un retal del{" "}
            <Link href="/inventario" className="underline underline-offset-4">
              inventario
            </Link>{" "}
            en vez de material nuevo.
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
  href,
}: {
  titulo: string;
  valor: string;
  nota: string;
  acento?: "emerald" | "destructive";
  /** Si se da, la tarjeta entera lleva a esa página. */
  href?: string;
}) {
  const color =
    acento === "emerald"
      ? "text-emerald-600"
      : acento === "destructive"
        ? "text-destructive"
        : "";

  const tarjeta = (
    <Card className={href ? "h-full transition-colors hover:bg-muted/40" : "h-full"}>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{tarjeta}</Link> : tarjeta;
}
