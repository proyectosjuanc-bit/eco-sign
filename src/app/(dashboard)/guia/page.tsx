import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearMoneda } from "@/lib/format";
import { SUSCRIPCION_MENSUAL } from "@/lib/roi";

export const metadata: Metadata = { title: "Cómo funciona · ECO-SIGN" };

/**
 * Guía de uso.
 *
 * Vive dentro de la aplicación y no en un documento aparte porque la duda
 * aparece justo cuando alguien está delante de un formulario y no sabe si lo
 * que tiene en la mano es un sobrante o un desperdicio.
 */
export default function GuiaPage() {
  return (
    <>
      <EncabezadoPagina
        titulo="Cómo funciona"
        descripcion="El recorrido completo, de la compra del material al ahorro del mes."
      />

      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              La idea en una línea
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              Cada retazo que reutilizas es material que no vuelves a comprar.
              ECO-SIGN registra ese dinero y lo compara con lo que pagas por el
              software, que son {formatearMoneda(SUSCRIPCION_MENSUAL)} al mes.
            </p>
            <p className="text-muted-foreground">
              Cuando el ahorro supera esa cifra, el software se paga solo. Eso es
              el ROI Circular del panel principal.
            </p>
          </CardContent>
        </Card>

        <Paso numero={1} titulo="Materiales: el catálogo de precios" enlace="/materiales">
          <p>
            Aquí defines <strong>qué materiales usas y cuánto cuestan</strong>.
            No es la bodega: lo que tienes físicamente va en Inventario.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Lámina (m²)</strong>: acrílico, PVC, vinilo… Escribe el tamaño de la lámina y su precio; el costo por m² se calcula solo.</li>
            <li><strong>Metro lineal</strong>: neón, cable, perfiles… Escribe el precio del metro.</li>
            <li><strong>Unidad</strong>: tornillos, luces LED, fuentes… Escribe el precio de cada una.</li>
          </ul>
          <Ejemplo>
            Acrílico negro 3 mm, lámina de 120 × 180 cm a $250.000: el sistema
            calcula 2,16 m² por lámina y $115.741 el m².
          </Ejemplo>
        </Paso>

        <Paso numero={2} titulo="Inventario: todo lo que tienes" enlace="/inventario">
          <p>
            Aquí vive <strong>todo lo físico</strong> del taller, en cuatro clases:
            láminas completas, retales (pedazos con medidas y código SOB), rollos
            por metro y unidades.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Cuando compras, usa <strong>Entrada de material</strong>: por ejemplo «Acrílico negro: 5 láminas» o «Neón rojo: 50 m».</li>
            <li>Si cuentas la bodega y algo no cuadra, usa <strong>Corregir</strong> en esa existencia.</li>
            <li>Los retales viejos que ya tenías, regístralos con <strong>Registrar retal</strong>. Marca su código con marcador sobre el material.</li>
          </ul>
        </Paso>

        <Paso numero={3} titulo="Trabajos: todo sale del inventario" enlace="/trabajos">
          <p>Crea el trabajo, ábrelo y sigue cuatro pasos:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <strong>Sacar del inventario</strong>: elige lo que usas. Si
              escribes la medida que necesitas, te muestra primero los{" "}
              <strong>retales que alcanzan</strong>. Usar un retal en vez de una
              lámina nueva es ahorro.
            </li>
            <li><strong>Piezas que entregas</strong>: las medidas de lo que se lleva el cliente.</li>
            <li><strong>Devolver sobrante</strong>: lo que te sobró y sirve vuelve al inventario como retal con código.</li>
            <li><strong>Recortes que se pierden</strong>: el sistema resta y anota en Desperdicio lo que no se aprovechó.</li>
          </ol>
          <Ejemplo>
            Aviso con acrílico de 50 × 50, 10 m de neón y 10 m de cable dúplex.
            Escribes 50 × 50 y aparece el retal SOB-014 (60 × 70): lo sacas (eso
            es ahorro). Sacas 10 m de neón y 10 m de cable de sus rollos.
            Registras la pieza de 50 × 50 y devuelves la franja de 60 × 20 que
            sobró. El resto del retal queda como recorte perdido.
          </Ejemplo>
          <p className="text-muted-foreground">
            ¿Te equivocaste? Con «Devolver» en la línea, el material vuelve al
            inventario. Si borras el trabajo, también vuelve todo lo que sacó.
          </p>
          <p>
            <strong>¿Forma irregular, como una letra corpórea?</strong> Anota como
            pieza el ancho y alto del rectángulo que la contiene.
          </p>
        </Paso>

        <Paso numero={4} titulo="Desperdicio: lo que se perdió" enlace="/desperdicio">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-emerald-600/30 bg-emerald-50/50 p-3">
              <p className="text-sm font-medium text-emerald-900">Sobrante</p>
              <p className="mt-1 text-xs text-emerald-800">
                Sirve. Vuelve al inventario como retal y lo vas a usar.
              </p>
            </div>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">Desperdicio</p>
              <p className="mt-1 text-xs text-destructive/80">
                No sirve. Corte errado, impresión mala, material rayado.
              </p>
            </div>
          </div>
          <p>
            Los recortes de cada trabajo se calculan solos (paso 4 del trabajo).
            Lo demás —una impresión dañada, una lámina rayada— lo registras en
            Desperdicio con sus medidas y el motivo.
          </p>
        </Paso>

        <Paso numero={5} titulo="Dashboard: el resultado" enlace="/dashboard">
          <p>
            El <strong>ahorro del mes</strong> sale de cada retal que un trabajo
            usa en vez de material nuevo, por su valor en pesos. También muestra
            el valor de tu inventario y el costo del desperdicio. Solo lo ven los
            administradores.
          </p>
        </Paso>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rutina diaria del taller</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ol className="ml-4 list-decimal space-y-2">
              <li>Llega material: regístralo en Inventario → Entrada de material.</li>
              <li>Empieza una obra: créala en Trabajos.</li>
              <li>Antes de cortar: escribe la medida en «Sacar del inventario» y usa un retal si alcanza.</li>
              <li>Al terminar: registra las piezas, devuelve lo que sobró y registra los recortes.</li>
              <li>Se dañó algo: regístralo en Desperdicio.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Paso({
  numero,
  titulo,
  enlace,
  children,
}: {
  numero: number;
  titulo: string;
  enlace: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {numero}
          </span>
          <Link href={enlace} className="underline-offset-4 hover:underline">
            {titulo}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Ejemplo({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-muted p-3 text-sm">
      <span className="font-medium">Ejemplo. </span>
      {children}
    </p>
  );
}
