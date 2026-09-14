"use client";

import { useActionState, useState } from "react";

import { venderSobrante } from "./actions";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
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

/**
 * Registra la venta de un sobrante tal cual, sin cortarlo.
 *
 * Es un ingreso, no un ahorro: no toca el ROI Circular del dashboard. Al
 * vender, el sobrante también queda marcado como usado, igual que al
 * reutilizarlo, porque ya no está disponible en el taller.
 */
export function DialogoVender({
  id,
  codigo,
}: {
  id: string;
  codigo: string | null;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setAbierto(true)}
      >
        Vender
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          {/* Se remonta con una key nueva cada vez que se abre, así
              useActionState arranca siempre limpio y no recuerda el
              resultado de una venta anterior. */}
          <FormularioVenta
            key={abierto ? "abierto" : "cerrado"}
            id={id}
            codigo={codigo}
            onVendido={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioVenta({
  id,
  codigo,
  onVendido,
}: {
  id: string;
  codigo: string | null;
  onVendido: () => void;
}) {
  const [estado, accion, enviando] = useActionState(
    venderSobrante,
    ESTADO_FORM_INICIAL,
  );

  // Patrón de React para reaccionar a un cambio de estado durante el render,
  // sin useEffect: se compara con el resultado ya visto y, si cambió a
  // éxito, se llama al callback ahí mismo, en el cuerpo del componente. Es
  // el mismo momento en que ya se sabe que `estado` cambió, sin esperar a un
  // ciclo de efectos aparte ni volver a invocar la Server Action.
  const [ultimoVisto, setUltimoVisto] = useState(estado);
  if (estado !== ultimoVisto) {
    setUltimoVisto(estado);
    if (estado.ok) onVendido();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Vender {codigo ?? "sobrante"}</DialogTitle>
        <DialogDescription>
          Se registra como un ingreso, no como ahorro, y el sobrante queda
          marcado como usado.
        </DialogDescription>
      </DialogHeader>

      <form action={accion} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={id} />

        <div className="grid gap-2">
          <Label htmlFor="monto">¿Cuánto cobraste?</Label>
          <Input
            id="monto"
            name="monto"
            type="number"
            step="1"
            min="0"
            inputMode="decimal"
            placeholder="50000"
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="descripcion">Notas (opcional)</Label>
          <Textarea
            id="descripcion"
            name="descripcion"
            rows={2}
            placeholder="A quién se lo vendiste, por ejemplo"
          />
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
            {enviando ? "Guardando…" : "Confirmar venta"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
