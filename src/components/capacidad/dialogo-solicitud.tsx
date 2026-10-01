"use client";

import { useActionState, useState } from "react";

import { solicitarMaquina } from "@/app/(dashboard)/capacidad/actions";
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
import { hoyEnColombia } from "@/lib/capacidad/tipos";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";

/**
 * Pide disponibilidad de una máquina de otro taller.
 *
 * Al enviar se guarda la solicitud y se avisa al dueño por correo. Tras el
 * envío el diálogo no se cierra solo: muestra la confirmación, para que
 * quede claro que la solicitud salió y qué pasa después.
 */
export function DialogoSolicitud({
  machineId,
  nombreMaquina,
  nombreTaller,
}: {
  machineId: string;
  nombreMaquina: string;
  nombreTaller: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button type="button" size="sm" className="w-full" onClick={() => setAbierto(true)}>
        Solicitar disponibilidad
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          {/* Se remonta al abrir para que useActionState arranque limpio,
              igual que el diálogo de vender sobrante. */}
          <FormularioSolicitud
            key={abierto ? "abierto" : "cerrado"}
            machineId={machineId}
            nombreMaquina={nombreMaquina}
            nombreTaller={nombreTaller}
            onCerrar={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioSolicitud({
  machineId,
  nombreMaquina,
  nombreTaller,
  onCerrar,
}: {
  machineId: string;
  nombreMaquina: string;
  nombreTaller: string;
  onCerrar: () => void;
}) {
  const [estado, accion, enviando] = useActionState(solicitarMaquina, ESTADO_FORM_INICIAL);

  if (estado.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Solicitud enviada</DialogTitle>
          <DialogDescription>
            Le avisamos a {nombreTaller} por correo. Cuando acepte o rechace, te llega un
            correo y lo ves en Solicitudes enviadas.
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
        <DialogTitle>Solicitar {nombreMaquina}</DialogTitle>
        <DialogDescription>
          {nombreTaller} recibirá tu mensaje y tu correo para responderte. El pago y la
          entrega los acuerdan entre ustedes.
        </DialogDescription>
      </DialogHeader>

      <form action={accion} className="flex flex-col gap-4">
        <input type="hidden" name="machine_id" value={machineId} />

        <div className="grid gap-2">
          <Label htmlFor="mensaje">Mensaje para el taller</Label>
          <Textarea
            id="mensaje"
            name="mensaje"
            rows={4}
            minLength={10}
            maxLength={1000}
            required
            placeholder="Necesito imprimir 20 m² de lona para una valla. Llevo el material."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="fecha_deseada">Fecha</Label>
            <Input
              id="fecha_deseada"
              name="fecha_deseada"
              type="date"
              min={hoyEnColombia()}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="duracion_estimada">Duración</Label>
            <Input
              id="duracion_estimada"
              name="duracion_estimada"
              placeholder="3 horas"
              maxLength={80}
              required
            />
          </div>
        </div>

        {estado.error ? (
          <p
            aria-live="polite"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {estado.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
