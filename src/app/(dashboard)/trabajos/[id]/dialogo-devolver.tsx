"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { devolverParte } from "../actions";
import { CampoFoto } from "@/components/dashboard/campo-foto";
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
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { formatearMoneda, formatearNumero } from "@/lib/format";
import { FOTOS_ACTIVAS } from "@/lib/funciones";
import type { ClaseInventario } from "@/types/database";

const UNIDAD: Partial<Record<ClaseInventario, string>> = {
  metros: "m",
  unidades: "unidades",
  mililitros: "ml",
};

/**
 * «Devolver» de una salida de metros, unidades o ml: pregunta cuánto se
 * devuelve (por defecto, todo) y, si es un rollo por metro, si vuelve al rollo
 * o queda como un retal aparte con sus medidas y foto opcional.
 */
export function DialogoDevolver({
  id,
  jobId,
  clase,
  material,
  sacado,
  precio,
  anchoSugerido,
}: {
  id: string;
  jobId: string;
  clase: ClaseInventario;
  material: string;
  /** Lo que salió en esta línea (m, unidades o ml). */
  sacado: number;
  /** Precio de 1 m, 1 unidad o 1 ml. */
  precio: number;
  /** Ancho del rollo leído del nombre («Vinilo x 60» → 60), si se puede. */
  anchoSugerido: number | null;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setAbierto(true)}
      >
        Devolver
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <FormularioDevolverParte
            key={abierto ? "abierto" : "cerrado"}
            id={id}
            jobId={jobId}
            clase={clase}
            material={material}
            sacado={sacado}
            precio={precio}
            anchoSugerido={anchoSugerido}
            onListo={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioDevolverParte({
  id,
  jobId,
  clase,
  material,
  sacado,
  precio,
  anchoSugerido,
  onListo,
}: {
  id: string;
  jobId: string;
  clase: ClaseInventario;
  material: string;
  sacado: number;
  precio: number;
  anchoSugerido: number | null;
  onListo: () => void;
}) {
  // Sin useActionState a propósito: si se devuelve todo, la fila (y este
  // diálogo) desaparece al actualizarse la página, y el aviso se perdería.
  // Llamando la acción a mano, el aviso sale apenas responde el servidor.
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const [cantidad, setCantidad] = useState(String(sacado));
  const [destino, setDestino] = useState<"inventario" | "retal">("inventario");
  const [ancho, setAncho] = useState(anchoSugerido ? String(anchoSugerido) : "");
  const [comprimiendo, setComprimiendo] = useState(false);
  const unidad = UNIDAD[clase] ?? "";
  const esRollo = clase === "metros";

  const devuelve = Number(cantidad.replace(",", ".")) || 0;
  const queda = Math.max(Math.round((sacado - devuelve) * 100) / 100, 0);

  const enviar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await devolverParte(ESTADO_FORM_INICIAL, datos);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      toast.success(
        destino === "retal"
          ? "Guardado como retal en el inventario."
          : `Devuelto al inventario: ${formatearNumero(devuelve)} ${unidad}.`,
      );
      onListo();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Devolver {material}</DialogTitle>
        <DialogDescription>
          Sacaste {formatearNumero(sacado)} {unidad} para este trabajo. Escribe cuánto no usaste.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="destino" value={destino} />

        <div className="grid gap-2">
          <Label htmlFor="devolver-cantidad">¿Cuánto devuelves? ({unidad})</Label>
          <Input
            id="devolver-cantidad"
            name="cantidad"
            type="number"
            inputMode="decimal"
            min={clase === "unidades" ? "1" : "0.01"}
            step={clase === "unidades" ? "1" : "0.01"}
            max={sacado}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
          />
          {devuelve > 0 && devuelve <= sacado ? (
            <p className="text-xs text-muted-foreground">
              El trabajo queda con <strong className="text-foreground">{formatearNumero(queda)} {unidad}</strong>
              {queda <= 0 ? " (se quita la salida)." : "."}
            </p>
          ) : null}
        </div>

        {esRollo ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">¿A dónde va?</legend>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm has-checked:border-emerald-600 has-checked:bg-emerald-50">
              <input
                type="radio"
                name="destino_radio"
                className="mt-0.5 accent-emerald-600"
                checked={destino === "inventario"}
                onChange={() => setDestino("inventario")}
              />
              <span>
                <strong>Al rollo</strong>
                <span className="block text-xs text-muted-foreground">
                  Se suma otra vez a los metros del rollo en el inventario.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm has-checked:border-emerald-600 has-checked:bg-emerald-50">
              <input
                type="radio"
                name="destino_radio"
                className="mt-0.5 accent-emerald-600"
                checked={destino === "retal"}
                onChange={() => setDestino("retal")}
              />
              <span>
                <strong>Como retal aparte</strong>
                <span className="block text-xs text-muted-foreground">
                  Un pedazo cortado que ya no vuelve al rollo: queda disponible
                  en Inventario → Retales, con su código, para otro trabajo.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        {esRollo && destino === "retal" ? (
          <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="devolver-ancho">Ancho del rollo (cm)</Label>
                <Input
                  id="devolver-ancho"
                  name="ancho_cm"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.1"
                  placeholder="60"
                  value={ancho}
                  onChange={(e) => setAncho(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Largo</Label>
                <p className="flex h-9 items-center text-sm">{formatearNumero(Math.round(devuelve * 1000) / 10)} cm</p>
              </div>
            </div>
            {devuelve > 0 ? (
              <p className="text-xs text-muted-foreground">
                Retal de {ancho || "—"} × {formatearNumero(Math.round(devuelve * 1000) / 10)} cm, valor{" "}
                {formatearMoneda(devuelve * precio)}.
              </p>
            ) : null}
            {FOTOS_ACTIVAS ? (
              <CampoFoto etiqueta="Foto del retal" onEstadoChange={setComprimiendo} />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="submit" disabled={enviando || comprimiendo || devuelve <= 0 || devuelve > sacado}>
            {comprimiendo
              ? "Preparando foto…"
              : enviando
                ? "Devolviendo…"
                : destino === "retal"
                  ? "Guardar como retal"
                  : "Devolver al inventario"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
