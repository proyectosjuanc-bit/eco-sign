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

        <Paso
          numero={1}
          titulo="Materiales: el catálogo y tus existencias"
          enlace="/materiales"
        >
          <p>
            Aquí registras <strong>lo que compras</strong>. Para una lámina,
            escribe su tamaño y el precio por lámina, y el costo por m² se
            calcula solo. En &laquo;Láminas que tienes&raquo; pon cuántas hay en
            bodega.
          </p>
          <Ejemplo>
            Acrílico rojo 3 mm, lámina de 120 × 180 cm a $250.000, tengo 5. El
            sistema calcula 2,16 m² por lámina y $115.741 el m².
          </Ejemplo>
          <p className="text-muted-foreground">
            Si el material no viene en láminas, como pintura o tornillería, deja
            las medidas vacías y escribe el costo por m² o por unidad.
          </p>
        </Paso>

        <Paso
          numero={2}
          titulo="Trabajos: lo que consumes en cada obra"
          enlace="/trabajos"
        >
          <p>
            Crea el trabajo y ábrelo desde la lista para añadirle el material
            que gastó. Hay dos formas de anotarlo:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Pieza</strong>: un corte concreto, con su cantidad. Por
              ejemplo tres placas de 40 × 30 cm.
            </li>
            <li>
              <strong>Lámina</strong>: la plancha entera que gastaste. Úsala
              cuando aprovechaste una lámina completa para varios cortes.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Al guardar, las láminas se descuentan solas de tus existencias.
          </p>
        </Paso>

        <Paso
          numero={3}
          titulo="Inventario: los retazos que puedes reutilizar"
          enlace="/inventario"
        >
          <p>
            Aquí <strong>no</strong> van las láminas nuevas que compraste: esas
            están en Materiales. Inventario es solo para los{" "}
            <strong>pedazos sueltos</strong> que quedaron de un corte y todavía
            sirven.
          </p>
          <Ejemplo>
            De la lámina de acrílico rojo sobró un pedazo de 60 × 40 cm. Le tomas
            foto, anotas las medidas y eliges el material. El sistema lo valora
            en $27.778, que es lo que costaría comprarlo.
          </Ejemplo>
          <p>
            No hace falta haber creado un trabajo antes. Si tienes retazos
            acumulados de trabajos viejos, regístralos hoy mismo.
          </p>
          <p className="text-muted-foreground">
            Cuando uses uno de esos retazos en otra obra, pulsa
            &laquo;Reutilizar&raquo;. Ese es el momento en que nace el ahorro:
            su valor pasa al panel principal.
          </p>
        </Paso>

        <Paso
          numero={4}
          titulo="Desperdicio: lo que se perdió"
          enlace="/desperdicio"
        >
          <p>
            Lo registras tú, el sistema no lo adivina. La diferencia con un
            sobrante es simple:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-emerald-600/30 bg-emerald-50/50 p-3">
              <p className="text-sm font-medium text-emerald-900">Sobrante</p>
              <p className="mt-1 text-xs text-emerald-800">
                Sirve. Lo guardas y lo vas a usar. Va a Inventario.
              </p>
            </div>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">Desperdicio</p>
              <p className="mt-1 text-xs text-destructive/80">
                No sirve. Corte errado, impresión mala, material rayado. Va a
                Desperdicio.
              </p>
            </div>
          </div>
          <p>
            Si lo puedes medir, escribe el ancho y el alto en cm y el sistema
            calcula los m² y el costo.
          </p>
          <Ejemplo>
            Una mala impresión echó a perder 150 × 500 cm de vinilo. Escribes
            esas dos medidas y el sistema anota 7,5 m² con su costo.
          </Ejemplo>
          <p>
            <strong>¿Y los recortes que no se pueden medir?</strong> De una
            lámina quedan decenas de pedacitos inservibles y nadie va a medirlos
            uno a uno. Para eso, dentro del trabajo hay un botón{" "}
            <strong>Registrar recortes</strong>: resta lo que aprovechaste al
            material que gastaste, y la diferencia la anota sola.
          </p>
          <p className="text-muted-foreground">
            Para que esa resta funcione, la lámina va en modo Lámina y los cortes
            aprovechados en modo Pieza.
          </p>
        </Paso>

        <Paso numero={5} titulo="Dashboard: el resultado" enlace="/dashboard">
          <p>El ahorro del mes se alimenta de dos fuentes:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Cada sobrante que marcas como reutilizado, por su valor en pesos.
            </li>
            <li>
              Cada trabajo donde el consumo real fue menor que el previsto, por
              la diferencia.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Ese consumo real lo registras al cerrar el trabajo, en el formulario
            que hay bajo la lista de piezas.
          </p>
        </Paso>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rutina diaria del taller</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ol className="ml-4 list-decimal space-y-2">
              <li>Llega material nuevo: súmalo en Materiales.</li>
              <li>Empieza una obra: créala en Trabajos y anota lo que gasta.</li>
              <li>
                Sobra un pedazo aprovechable: foto y a Inventario, ahí mismo en
                el taller.
              </li>
              <li>Se dañó algo: regístralo en Desperdicio.</li>
              <li>
                Vas a cortar algo nuevo: mira primero Inventario, y si usas un
                retazo márcalo como reutilizado.
              </li>
              <li>Cierra el trabajo con el consumo real.</li>
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
