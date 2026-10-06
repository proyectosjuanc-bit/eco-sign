"use client";

import { useActionState, useState } from "react";

import {
  publicarBusqueda,
  responderBusqueda,
  retirarRespuestaBusqueda,
} from "@/app/(dashboard)/capacidad/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_MAQUINA, hoyEnColombia } from "@/lib/capacidad/tipos";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { enviarSinLimpiar } from "@/lib/enviar-formulario";

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function MensajeError({ mensaje }: { mensaje: string | null }) {
  return mensaje ? (
    <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {mensaje}
    </p>
  ) : null;
}

/**
 * «Busco máquina»: publica una búsqueda para toda la red. Les llega un aviso
 * a los administradores de todos los demás talleres.
 *
 * Igual que el diálogo de solicitud: se remonta al abrir y, al enviar, muestra
 * la confirmación en vez de cerrarse solo.
 */
export function DialogoPublicarBusqueda({ ciudad }: { ciudad: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button onClick={() => setAbierto(true)}>Publicar búsqueda</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <FormularioBusqueda
            key={abierto ? "abierto" : "cerrado"}
            ciudad={ciudad}
            onCerrar={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioBusqueda({ ciudad, onCerrar }: { ciudad: string; onCerrar: () => void }) {
  const [estado, accion, enviando] = useActionState(publicarBusqueda, ESTADO_FORM_INICIAL);

  if (estado.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Búsqueda publicada</DialogTitle>
          <DialogDescription>
            Les avisamos a los talleres de la red. Cuando alguno responda «Yo puedo
            ayudar», te llega un aviso con su mensaje y su teléfono.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onCerrar}>
            Listo
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>¿Qué máquina buscas?</DialogTitle>
        <DialogDescription>
          Les llega un aviso a todos los talleres de la red, aunque no tengan la
          máquina publicada. Puedes publicar hasta 3 búsquedas al día.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="busqueda-tipo">Máquina</Label>
          <select id="busqueda-tipo" name="tipo" required defaultValue="" className={CLASE_SELECT}>
            <option value="" disabled>
              Elige una…
            </option>
            {TIPOS_MAQUINA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="busqueda-descripcion">¿Para qué trabajo?</Label>
          <Textarea
            id="busqueda-descripcion"
            name="descripcion"
            rows={4}
            minLength={10}
            maxLength={1000}
            required
            placeholder="Cortar 50 letras en acrílico de 3 mm, de 30 cm de alto. Llevo el material."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="busqueda-fecha">Fecha</Label>
            <Input id="busqueda-fecha" name="fecha_deseada" type="date" min={hoyEnColombia()} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="busqueda-ciudad">Ciudad</Label>
            <Input id="busqueda-ciudad" name="ciudad" defaultValue={ciudad} maxLength={80} required />
          </div>
        </div>

        <MensajeError mensaje={estado.error} />

        <DialogFooter>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Publicando…" : "Publicar y avisar a la red"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * «Yo puedo ayudar»: responde una búsqueda de otro taller con un mensaje y un
 * teléfono. Si ya respondió, muestra su respuesta y el botón para retirarla.
 *
 * El botón y la respuesta dada viven en ESTE componente a propósito (como en
 * DialogoCalificar): al enviar, la página se actualiza y pasa `respuesta`; si
 * fueran componentes distintos, el diálogo se desmontaría antes de mostrar la
 * confirmación.
 */
export function DialogoAyudar({
  searchId,
  nombreTaller,
  telefono,
  respuesta,
}: {
  searchId: string;
  nombreTaller: string;
  /** Teléfono sugerido (el del taller o el de una máquina). */
  telefono: string;
  /** La respuesta que ya dio este taller, si respondió. */
  respuesta?: { id: string; mensaje: string };
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {respuesta ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="break-words">✓ Respondiste: «{respuesta.mensaje}»</span>
          <form action={retirarRespuestaBusqueda}>
            <input type="hidden" name="id" value={respuesta.id} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
            >
              Retirar
            </Button>
          </form>
        </div>
      ) : (
        <Button size="sm" className="w-fit" onClick={() => setAbierto(true)}>
          Yo puedo ayudar
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <FormularioAyudar
            key={abierto ? "abierto" : "cerrado"}
            searchId={searchId}
            nombreTaller={nombreTaller}
            telefono={telefono}
            onCerrar={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioAyudar({
  searchId,
  nombreTaller,
  telefono,
  onCerrar,
}: {
  searchId: string;
  nombreTaller: string;
  telefono: string;
  onCerrar: () => void;
}) {
  const [estado, accion, enviando] = useActionState(responderBusqueda, ESTADO_FORM_INICIAL);

  if (estado.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Respuesta enviada</DialogTitle>
          <DialogDescription>
            A {nombreTaller} le llegó un aviso con tu mensaje y tu teléfono. Te
            contactarán para coordinar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onCerrar}>
            Listo
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ayudar a {nombreTaller}</DialogTitle>
        <DialogDescription>
          Solo {nombreTaller} verá tu mensaje y tu teléfono. El precio y la entrega
          los acuerdan entre ustedes.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-4">
        <input type="hidden" name="search_id" value={searchId} />
        <div className="grid gap-2">
          <Label htmlFor={`ayudar-mensaje-${searchId}`}>Mensaje</Label>
          <Textarea
            id={`ayudar-mensaje-${searchId}`}
            name="mensaje"
            rows={3}
            minLength={5}
            maxLength={500}
            required
            placeholder="Tengo un láser de 1,30 × 0,90 m libre ese día. Cobro por hora."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`ayudar-telefono-${searchId}`}>Teléfono para que te contacten</Label>
          <Input
            id={`ayudar-telefono-${searchId}`}
            name="telefono"
            type="tel"
            defaultValue={telefono}
            maxLength={20}
            required
          />
        </div>

        <MensajeError mensaje={estado.error} />

        <DialogFooter>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar respuesta"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
