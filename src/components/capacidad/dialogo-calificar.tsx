"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { calificarSolicitud } from "@/app/(dashboard)/capacidad/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstrellasFijas } from "@/components/capacidad/reputacion";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { cn } from "@/lib/utils";

const TEXTO_ESTRELLAS = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

/**
 * Calificar al taller dueño de una máquina, cuando la solicitud quedó
 * completada. Una sola vez: después muestra la calificación dada.
 *
 * El botón y la calificación dada viven en ESTE mismo componente a propósito:
 * al guardar, la página se actualiza y pasa `estrellasDadas`; si fueran
 * componentes distintos, el diálogo se desmontaría antes de mostrar el aviso.
 */
export function DialogoCalificar({
  solicitudId,
  nombreTaller,
  nombreMaquina,
  estrellasDadas,
}: {
  solicitudId: string;
  nombreTaller: string;
  nombreMaquina: string;
  /** Si ya calificó, cuántas estrellas dio. */
  estrellasDadas?: number;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {estrellasDadas ? (
        <p className="text-sm text-muted-foreground">
          Tu calificación: <EstrellasFijas estrellas={estrellasDadas} />
        </p>
      ) : (
        <Button size="sm" onClick={() => setAbierto(true)}>
          ★ Calificar
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <FormularioCalificar
            key={abierto ? "abierto" : "cerrado"}
            solicitudId={solicitudId}
            nombreTaller={nombreTaller}
            nombreMaquina={nombreMaquina}
            onListo={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioCalificar({
  solicitudId,
  nombreTaller,
  nombreMaquina,
  onListo,
}: {
  solicitudId: string;
  nombreTaller: string;
  nombreMaquina: string;
  onListo: () => void;
}) {
  const [estado, accion, enviando] = useActionState(calificarSolicitud, ESTADO_FORM_INICIAL);
  const [estrellas, setEstrellas] = useState(0);
  const [encima, setEncima] = useState(0);

  useEffect(() => {
    if (!estado.ok) return;
    toast.success("¡Gracias! Tu calificación ya cuenta en la reputación del taller.");
    onListo();
    // Sólo reacciona al resultado del envío.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const mostrada = encima || estrellas;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Calificar a {nombreTaller}</DialogTitle>
        <DialogDescription>
          ¿Cómo te fue con «{nombreMaquina}»? Tu calificación la ven los demás
          talleres de la red y no se puede cambiar después.
        </DialogDescription>
      </DialogHeader>

      <form action={accion} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={solicitudId} />
        <input type="hidden" name="estrellas" value={estrellas || ""} />

        <fieldset className="flex flex-col items-center gap-1">
          <legend className="sr-only">Estrellas</legend>
          <div className="flex gap-1" onMouseLeave={() => setEncima(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}: ${TEXTO_ESTRELLAS[n]}`}
                aria-pressed={estrellas === n}
                onClick={() => setEstrellas(n)}
                onMouseEnter={() => setEncima(n)}
                className={cn(
                  "text-4xl leading-none transition-colors",
                  n <= mostrada ? "text-amber-500" : "text-muted-foreground/30",
                )}
              >
                ★
              </button>
            ))}
          </div>
          <p className="h-5 text-sm text-muted-foreground">{TEXTO_ESTRELLAS[mostrada]}</p>
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor={`comentario-${solicitudId}`}>Comentario (opcional)</Label>
          <Textarea
            id={`comentario-${solicitudId}`}
            name="comentario"
            rows={3}
            maxLength={500}
            placeholder="Cumplió el horario, la máquina estaba en buen estado…"
          />
        </div>

        {estado.error ? (
          <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {estado.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="submit" disabled={enviando || !estrellas}>
            {enviando ? "Guardando…" : "Enviar calificación"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
