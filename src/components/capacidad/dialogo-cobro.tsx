"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { completarSolicitud, registrarCobro } from "@/app/(dashboard)/capacidad/actions";
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
import { formatearMoneda } from "@/lib/format";

/**
 * Lo que el dueño de una máquina cobró por una solicitud.
 *
 * - Aceptada: «Marcar como completada» pregunta cuánto cobró (opcional).
 * - Completada: muestra lo cobrado, o el botón para registrarlo después.
 *
 * Los dos casos viven en ESTE componente a propósito (como DialogoCalificar):
 * al completar, la tarjeta pasa a «completada» y, si fueran componentes
 * distintos, el diálogo se desmontaría antes de cerrar y avisar.
 */
export function DialogoCobro({
  solicitudId,
  estado,
  monto,
  nombreTaller,
}: {
  solicitudId: string;
  estado: "aceptada" | "completada";
  monto: number | null;
  nombreTaller: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();
  const completar = estado === "aceptada";

  const abrir = () => {
    setValor(monto != null ? String(monto) : "");
    setError(null);
    setAbierto(true);
  };

  const guardar = (evento: React.FormEvent) => {
    evento.preventDefault();
    const limpio = valor.replace(/[^\d]/g, "");
    const numero = limpio ? Number(limpio) : null;
    startTransition(async () => {
      const { error } = completar
        ? await completarSolicitud(solicitudId, numero)
        : await registrarCobro(solicitudId, numero);
      if (error) {
        setError(error);
        return;
      }
      toast.success(
        completar
          ? numero
            ? `Completada. Cobraste ${formatearMoneda(numero)}: ya suma en tu Dashboard.`
            : "Completada. Puedes registrar lo que cobraste cuando quieras."
          : "Cobro guardado: ya suma en tu Dashboard.",
      );
      setAbierto(false);
    });
  };

  return (
    <>
      {completar ? (
        <Button size="sm" variant="outline" onClick={abrir}>
          Marcar como completada
        </Button>
      ) : monto != null ? (
        <p className="text-sm">
          Cobraste <strong className="text-emerald-700">{formatearMoneda(monto)}</strong>{" "}
          <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={abrir}>
            Cambiar
          </button>
        </p>
      ) : (
        <Button size="sm" variant="outline" onClick={abrir}>
          Registrar lo que cobraste
        </Button>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{completar ? "Marcar como completada" : "Lo que cobraste"}</DialogTitle>
            <DialogDescription>
              ¿Cuánto le cobraste a {nombreTaller} por el uso de tu máquina? Se suma
              en tu Dashboard como «Ingresos por Capacidad». Solo tú lo ves.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={guardar} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`cobro-${solicitudId}`}>
                Valor cobrado{completar ? " (opcional)" : ""}
              </Label>
              <Input
                id={`cobro-${solicitudId}`}
                inputMode="numeric"
                placeholder="80000"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
              {completar ? (
                <p className="text-xs text-muted-foreground">
                  Si todavía no lo sabes, déjalo vacío y regístralo después.
                </p>
              ) : null}
            </div>
            {error ? (
              <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : completar ? "Marcar como completada" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
