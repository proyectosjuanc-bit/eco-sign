import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        descripcion="El recorrido completo: del material que compras al ahorro del mes y lo que ganas prestando tus máquinas."
      />

      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">La idea en una línea</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              Cada retal que reutilizas es material que no vuelves a comprar, y
              cada hora que tu máquina está quieta puede ser plata si otro
              taller la usa. ECO-SIGN registra las dos cosas para que veas cuánto
              ahorras y cuánto ganas.
            </p>
            <nav aria-label="Secciones de la guía" className="flex flex-wrap gap-2 text-xs">
              {SECCIONES.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="rounded-full border px-2.5 py-1 hover:bg-muted">
                  {s.numero}. {s.nombre}
                </a>
              ))}
            </nav>
          </CardContent>
        </Card>

        <Paso id="materiales" numero={1} titulo="Materiales: el catálogo de precios" enlace="/materiales">
          <p>
            Aquí defines <strong>qué materiales usas y cuánto cuestan</strong>.
            Solo precios: lo que tienes físicamente se registra en Inventario.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Lámina (m²)</strong>: acrílico, PVC, vinilo… Escribe el tamaño de la lámina y su precio; el costo por m² se calcula solo.</li>
            <li><strong>Metro lineal</strong>: neón, cable, vinilo de corte en rollo… Escribe el precio del metro.</li>
            <li><strong>Unidad</strong>: tornillos, luces LED, fuentes… Escribe el precio de cada una.</li>
            <li><strong>Mililitros</strong>: tintas, adhesivos, pinturas, thinner. Escribe el precio del envase y cuánto trae (1 litro = 1000 ml, 1 galón = 3785 ml); el precio por ml se calcula solo.</li>
          </ul>
          <Ejemplo>
            Acrílico negro 3 mm, lámina de 120 × 180 cm a $250.000: el sistema
            calcula 2,16 m² por lámina y $115.741 el m². Tinta cyan, botella de
            1000 ml a $95.000: $95 el ml.
          </Ejemplo>
          <p className="text-muted-foreground">
            ¿Muchos materiales? Usa <strong>Cargar varios materiales</strong> con la
            plantilla de Excel.
          </p>
        </Paso>

        <Paso id="inventario" numero={2} titulo="Inventario: todo lo que tienes" enlace="/inventario">
          <p>
            Aquí vive <strong>todo lo físico</strong> del taller: láminas
            completas, retales (pedazos con medidas y código SOB), rollos por
            metro, unidades y líquidos en ml.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Cuando compras, usa <strong>Entrada de material</strong>: por ejemplo «Acrílico negro: 5 láminas», «Neón rojo: 50 m» o «Tinta cyan: 1000 ml».</li>
            <li>Si cuentas la bodega y algo no cuadra, usa <strong>Corregir</strong> en esa existencia.</li>
            <li>Los retales viejos que ya tenías, regístralos con <strong>Registrar retal</strong>. Marca su código con marcador sobre el material.</li>
            <li><strong>Usar en un trabajo</strong> te lleva directo a sacar esa existencia para un trabajo.</li>
          </ul>
        </Paso>

        <Paso id="trabajos" numero={3} titulo="Trabajos: todo sale del inventario" enlace="/trabajos">
          <p>
            Crea el trabajo con su <strong>fecha de entrega</strong> (si se pasa
            sin terminarlo, sale en rojo en la lista). Consejo: pon el tipo en el
            nombre, por ejemplo «Aviso neón – Los montañeros», y crea otro
            trabajo para lo demás del mismo cliente («Impresión lona – Los
            montañeros»). Luego ábrelo y sigue dos pasos:
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <strong>Sacar del inventario</strong>: todo lo que usas (acrílico,
              PVC, luces, cable, pegante…). Si escribes la medida que necesitas,
              te muestra primero los <strong>retales que alcanzan</strong>. Usar
              un retal en vez de una lámina nueva es ahorro. ¿Necesitas más? Sácalo
              otra vez.
            </li>
            <li><strong>Devolver sobrante</strong>: lo que te sobró de una lámina y sirve vuelve al inventario como retal con código.</li>
          </ol>
          <Ejemplo>
            Aviso de neón: escribes 35 × 80 y aparece el retal SOB-014 (40 × 90):
            lo sacas (eso es ahorro). Sacas 5 m de neón verde, 5 m de cable y 1
            enchufe. Al terminar devuelves la franja de 40 × 10 que sobró y
            sirve.
          </Ejemplo>
          <p>
            <strong>Tintas de impresión</strong>: en «Sacar del inventario», el
            botón <strong>🖨️ Tintas de impresión</strong> saca todas las tintas
            de una impresión a la vez. Escribes la medida impresa, marcas las
            tintas (cyan, magenta, amarillo, negro, blanco) y los ml que gasta tu
            máquina por m² de cada una; quedan guardados para la próxima.
          </p>
          <p>
            <strong>Adhesivos, pinturas y otros líquidos</strong>: al elegirlos,
            el botón <strong>🧮 Calcular consumo</strong> multiplica los m² por
            los ml que gasta tu máquina. Si no lo sabes, lo calcula con lo que
            gastaste en un periodo (ml gastados ÷ m² hechos).
          </p>
          <p className="text-muted-foreground">
            ¿Sacaste de más? Con <strong>Devolver</strong> en la línea decides
            cuánto devuelves. Los rollos por metro pueden volver al rollo o
            quedar como un retal aparte con su foto. Si borras el trabajo, vuelve
            todo lo que sacó.
          </p>
        </Paso>

        <Paso id="desperdicio" numero={4} titulo="Desperdicio: lo que se perdió" enlace="/desperdicio">
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
            Lo que se daña o se bota —una impresión mala, una lámina rayada, un
            corte errado— lo registras en Desperdicio con sus medidas, el motivo
            y una foto si quieres.
          </p>
        </Paso>

        <Paso id="capacidad" numero={5} titulo="Capacidad: presta y pide máquinas" enlace="/capacidad">
          <p>
            La red de talleres de ECO-SIGN: cuando tu máquina está quieta, otro
            taller te la puede alquilar; cuando te falta una, la consigues.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Mis máquinas</strong>: publica las tuyas con fotos, precio, contacto y las horas en que están disponibles cada día.</li>
            <li><strong>Red de talleres</strong>: busca máquinas de otros talleres y toca <strong>Solicitar disponibilidad</strong>.</li>
            <li><strong>Busco máquina</strong>: ¿necesitas una máquina que nadie tiene publicada? Cuenta para qué trabajo y les llega un aviso a todos los talleres; los que puedan responden «Yo puedo ayudar» con su teléfono.</li>
            <li><strong>Recibidas</strong>: acepta o rechaza lo que te piden. Al terminar, <strong>Marcar como completada</strong> te pregunta cuánto cobraste: eso suma en tu Dashboard.</li>
            <li><strong>Enviadas</strong>: en qué va lo que pediste. Cuando te la completen, califica al taller con estrellas.</li>
          </ul>
          <p className="text-muted-foreground">
            <strong>Reputación</strong>: todos empiezan con 5,0 estrellas y llevan la
            etiqueta «Nuevo» hasta tener 3 calificaciones.
          </p>
          <Ejemplo>
            Tu láser está libre los sábados. Lo publicas con ese horario; otro
            taller lo pide para cortar 40 letras, lo aceptas, haces el trabajo y
            lo marcas como completado con $80.000 cobrados.
          </Ejemplo>
        </Paso>

        <Paso id="avisos" numero={6} titulo="Avisos: la campanita 🔔" enlace="/perfil">
          <p>
            La campanita de arriba te avisa cuando te piden una máquina, te
            responden, te califican o alguien busca una máquina en la red.
          </p>
          <p>
            Para recibirlos también en el <strong>celular o el computador</strong>,
            aunque ECO-SIGN esté cerrado: toca la campanita →{" "}
            <strong>Activar avisos aquí</strong>, en cada dispositivo. En iPhone,
            primero agrega ECO-SIGN a la pantalla de inicio (Safari → Compartir →
            Agregar a inicio).
          </p>
        </Paso>

        <Paso id="dashboard" numero={7} titulo="Dashboard: el resultado" enlace="/dashboard" soloAdmin>
          <p>
            El <strong>Resumen del taller</strong>: ahorro del mes (cada retal que
            un trabajo usa en vez de material nuevo), desperdicio del mes,
            trabajos en proceso e <strong>ingresos por Capacidad</strong> (lo que
            cobraste prestando tus máquinas). También el valor de tu inventario.
          </p>
        </Paso>

        <Paso id="equipo" numero={8} titulo="Equipo: quién usa ECO-SIGN" enlace="/configuracion/equipo" soloAdmin>
          <p>
            Invita a tu gente con su correo y elige qué puede hacer cada uno:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Administrador</strong>: todo, incluido el Dashboard, el equipo y la configuración.</li>
            <li><strong>Operario</strong>: registra el día a día (inventario, trabajos, desperdicio, capacidad), sin ver las cifras de dinero del Dashboard.</li>
            <li><strong>Solo lectura</strong>: ve la información, pero no puede crear, editar ni borrar.</li>
          </ul>
          <p className="text-muted-foreground">
            La invitación llega por correo y vence a los 7 días. Puedes cambiar el
            rol de alguien o desactivarlo cuando ya no trabaje contigo.
          </p>
        </Paso>

        <Paso id="configuracion" numero={9} titulo="Configuración: los datos del taller" enlace="/configuracion" soloAdmin>
          <p>
            El nombre, NIT, teléfono, ciudad y dirección del taller. El{" "}
            <strong>teléfono</strong> es el que se sugiere cuando respondes una
            búsqueda en Capacidad, y la <strong>ciudad</strong> la que aparece al
            publicar una. Ahí también está el contacto de soporte.
          </p>
          <p className="text-muted-foreground">
            Tus datos personales (nombre, contraseña, avisos de cada dispositivo)
            están en <Link href="/perfil" className="underline underline-offset-4">Mi perfil</Link>,
            tocando tu nombre arriba.
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
              <li>Si imprimes: saca las tintas con «Tintas de impresión».</li>
              <li>Al terminar: devuelve lo que sobró y sirve, y marca el trabajo como terminado.</li>
              <li>Se dañó algo: regístralo en Desperdicio.</li>
              <li>Revisa la campanita: responde las solicitudes de Capacidad.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const SECCIONES = [
  { id: "materiales", numero: 1, nombre: "Materiales" },
  { id: "inventario", numero: 2, nombre: "Inventario" },
  { id: "trabajos", numero: 3, nombre: "Trabajos" },
  { id: "desperdicio", numero: 4, nombre: "Desperdicio" },
  { id: "capacidad", numero: 5, nombre: "Capacidad" },
  { id: "avisos", numero: 6, nombre: "Avisos" },
  { id: "dashboard", numero: 7, nombre: "Dashboard" },
  { id: "equipo", numero: 8, nombre: "Equipo" },
  { id: "configuracion", numero: 9, nombre: "Configuración" },
];

function Paso({
  id,
  numero,
  titulo,
  enlace,
  soloAdmin = false,
  children,
}: {
  id: string;
  numero: number;
  titulo: string;
  enlace: string;
  /** Sección que sólo ven los administradores del taller. */
  soloAdmin?: boolean;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {numero}
          </span>
          <Link href={enlace} className="underline-offset-4 hover:underline">
            {titulo}
          </Link>
          {soloAdmin ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              Solo administradores
            </span>
          ) : null}
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
